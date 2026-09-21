// @vitest-environment node
import { appendFileSync } from 'node:fs';
import { hexToBytes } from '@noble/hashes/utils.js';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { composeBroadcast, composeSend } from '@/core/counterparty/compose';
import { verifyTransaction } from '@/core/counterparty/unpack/verify';
import { DEFAULT_SETTINGS, setSettingsProvider } from '@/core/settings';
import { huntZeldForCompose } from '@/core/zeld/composeHunt';
import {
  broadcastAndMine, counterparty, ensureMinerWallet, ensureXcp, fund, keyFor, legacyKeyFor,
  nestedKeyFor, parsedTransaction, REGTEST_ENABLED, rpc, scanUnspents, signAsWallet, taprootKeyFor, xcpBalance,
} from './regtestHarness';

// Regtest transport adapters. Composition, input selection, hashing, verification and signing
// are the production functions. Every UTXO and previous transaction below comes from Bitcoin Core.
vi.mock('@/core/bitcoin/utxo', async original => ({
  ...(await original<typeof import('@/core/bitcoin/utxo')>()),
  fetchUTXOs: async (address: string) => (await scanUnspents(address)).map(u => ({
    txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8),
    status: { confirmed: true, block_height: u.height, block_hash: '', block_time: 0 },
  })),
  fetchPreviousRawTransaction: async (txid: string) => rpc<string>('getrawtransaction', [txid], null),
}));

describe('production wallet transaction flow on regtest', () => {
  it.runIf(REGTEST_ENABLED)('composes, hunts, signs and confirms normal wallet payments without changing their BTC fee', async () => {
    setSettingsProvider(() => ({ ...DEFAULT_SETTINGS,
      counterpartyApiBase: process.env.ZELD_REGTEST_COUNTERPARTY ?? 'http://127.0.0.1:34000', allowUnconfirmedTxs: false,
    }));
    const miner = await ensureMinerWallet();
    const targetZeros = Number(process.env.ZELD_REGTEST_ZEROS ?? 4);
    const keys = [keyFor('wallet-native'), nestedKeyFor('wallet-nested'), taprootKeyFor('wallet-taproot'), legacyKeyFor('wallet-legacy')];
    await fund(miner, keys, 3);
    const evidence: unknown[] = [];
    for (const key of keys) {
      const params = { sourceAddress: key.address, text: `Wallet ${key.addressFormat} hunt`, value: '0', fee_fraction: '0',
        timestamp: String(Math.floor(Date.now() / 1000)), sat_per_vbyte: 2, encoding: 'opreturn' };
      const composed = await composeBroadcast(params);
      expect(verifyTransaction(composed.result.data, 'broadcast', params).valid).toBe(true);
      const reviewed = Transaction.fromRaw(hexToBytes(composed.result.rawtransaction), { allowUnknownOutputs: true });
      const started = performance.now();
      const hunted = await huntZeldForCompose(composed, { sourceAddress: key.address, addressFormat: key.addressFormat,
        publicKeyHex: key.publicKeyHex, walletType: 'privateKey', seconds: 60, targetZeros });
      // Legacy uses the production signer integration, at its actual six-zero target and 60s cap.
      const signed = await signAsWallet(hunted, key, key.addressFormat === AddressFormat.P2PKH ? 60 : 0);
      if (key.addressFormat !== AddressFormat.P2PKH) expect(signed.txid).toBe(hunted.result.zeld_hunt?.txid);
      const nodeTx = await rpc<{ txid: string; vsize: number; vin: Array<{ sequence: number }>; vout: Array<{ value: number; scriptPubKey: { hex: string } }> }>(
        'decoderawtransaction', [signed.hex], null);
      for (let i = 0; i < reviewed.outputsLength; i++) {
        expect(nodeTx.vout[i]!.scriptPubKey.hex).toBe(Buffer.from(reviewed.getOutput(i).script!).toString('hex'));
        expect(Math.round(nodeTx.vout[i]!.value * 1e8)).toBe(Number(reviewed.getOutput(i).amount));
      }
      const fee = composed.result.inputs_values.reduce((sum, value) => sum + value, 0)
        - nodeTx.vout.reduce((sum, output) => sum + Math.round(output.value * 1e8), 0);
      expect(fee).toBe(composed.result.btc_fee);
      expect(nodeTx.vin.every(input => input.sequence === 0xffffffff)).toBe(true);
      const txid = await broadcastAndMine(signed.hex, miner);
      const parsed = await parsedTransaction(txid);
      expect(parsed.supported).toBe(true);
      expect(parsed.unpacked_data?.message_type).toBe('broadcast');
      const broadcasts = await counterparty<Array<{ tx_hash: string; status: string }>>(`/addresses/${key.address}/broadcasts`);
      expect(broadcasts.some(item => item.tx_hash === txid)).toBe(true);
      evidence.push({ format: key.addressFormat, txid, feeSats: fee, vsize: nodeTx.vsize,
        signingAndConfirmationMs: Math.round(performance.now() - started), message: 'broadcast' });
    }
    // Exercise the ordinary XCP Send composer as well, including change ordering and real credit.
    const sender = keys[0]!;
    const recipient = keyFor('wallet-recipient');
    await ensureXcp(sender, miner);
    const params = { sourceAddress: sender.address, destination: recipient.address, asset: 'XCP', quantity: '100000000',
      sat_per_vbyte: 2, encoding: 'opreturn' };
    const sent = await composeSend(params);
    // The wallet renders witness addresses on mainnet; the protocol payload stores only the
    // witness program. Compare the same program using that production address representation.
    const verified = verifyTransaction(sent.result.data, 'send', { ...params,
      destination: p2wpkh(hexToBytes(recipient.publicKeyHex)).address });
    expect(verified.valid, JSON.stringify(verified, (_key, value) => typeof value === 'bigint' ? String(value) : value)).toBe(true);
    const hunted = await huntZeldForCompose(sent, { sourceAddress: sender.address, addressFormat: sender.addressFormat,
      walletType: 'privateKey', seconds: 60, targetZeros });
    const signed = await signAsWallet(hunted, sender);
    expect(signed.txid).toBe(hunted.result.zeld_hunt?.txid);
    await broadcastAndMine(signed.hex, miner);
    expect(await xcpBalance(recipient.address)).toBe(100_000_000);
    evidence.push({ format: sender.addressFormat, txid: signed.txid, message: 'enhanced_send', creditedXcpBaseUnits: 100_000_000 });
    if (process.env.ZELD_REGTEST_OUT) appendFileSync(process.env.ZELD_REGTEST_OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  }, 600_000);
});
