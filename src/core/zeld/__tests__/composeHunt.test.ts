import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { parsePSBT } from '@/core/bitcoin/psbt';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import { assertTransactionMatchesReviewed, parseTransactionForIntegrity } from '@/core/bitcoin/transactionIntegrity';
import type { ApiResponse } from '@/core/counterparty/compose';
import { huntZeldForCompose } from '@/core/zeld/composeHunt';
import type { HuntTxidResult } from '@/core/zeld/hunt';
import { psbtWithNonce } from '@/core/zeld/psbtNonce';
import { enhancedSendRawTx, opReturnScript, PREV_TXID, PUBKEY, psbtHexFor, SOURCE_ADDRESS, SOURCE_NESTED, SOURCE_P2WPKH, unsignedRawTx } from './fixtures';

function responseFor(rawtransaction: string, psbt = psbtHexFor(rawtransaction)): ApiResponse {
  return {
    result: {
      rawtransaction,
      btc_in: 100_000,
      btc_out: 0,
      btc_change: 95_160,
      btc_fee: 4_840,
      data: '',
      lock_scripts: [],
      inputs_values: [100_000],
      signed_tx_estimated_size: { vsize: 150, adjusted_vsize: 150, sigops_count: 1 },
      psbt,
      params: {
        source: SOURCE_ADDRESS,
        asset: 'XCP',
        quantity: 1,
        memo: null,
        memo_is_hex: false,
        use_enhanced_send: true,
        no_dispense: false,
        skip_validation: false,
        asset_info: { asset_longname: null, description: '', issuer: '', divisible: true, locked: false, owner: '' },
        quantity_normalized: '0.00000001',
      },
      name: 'send',
    },
  };
}

const context = {
  sourceAddress: SOURCE_ADDRESS,
  addressFormat: AddressFormat.P2WPKH,
  walletType: 'mnemonic' as const,
  seconds: 5,
};

describe('huntZeldForCompose', () => {
  it('preserves a commit txid when an already signed reveal depends on it', async () => {
    const response = responseFor(enhancedSendRawTx());
    response.result.signed_reveal_rawtransaction = 'already signed child';
    const hunt = vi.fn();
    const result = await huntZeldForCompose(response, { ...context, hunt });
    expect(hunt).not.toHaveBeenCalled();
    expect(result.result.rawtransaction).toBe(response.result.rawtransaction);
    expect(result.result.zeld_hunt?.reason).toContain('reveal');
  });
  it('does nothing when the budget is zero', async () => {
    const response = responseFor(enhancedSendRawTx());
    const hunt = vi.fn();
    const result = await huntZeldForCompose(response, { ...context, seconds: 0, hunt });
    expect(result).toBe(response);
    expect(hunt).not.toHaveBeenCalled();
  });

  it('rewrites only the nonce fields when a txid is found, in both raw and PSBT form', async () => {
    const rawTxHex = enhancedSendRawTx();
    const response = responseFor(rawTxHex);
    const result = await huntZeldForCompose(response, { ...context, targetZeros: 2 });

    const hunted = result.result;
    expect(hunted.zeld_hunt?.status).toBe('found');
    expect(hunted.zeld_hunt?.txid?.startsWith('00')).toBe(true);
    expect(hunted.rawtransaction).not.toBe(rawTxHex);
    expect(parseRawTransactionLocally(hunted.rawtransaction)?.txid).toBe(hunted.zeld_hunt?.txid);
    const huntedTx = parseConsensusTransaction(hunted.rawtransaction);
    expect(huntedTx.lockTime).toBe(hunted.zeld_hunt?.nonce);
    expect(huntedTx.getInput(0).sequence).toBe(0xffffffff);
    // The hardware path insists the PSBT describes the reviewed bytes; the hunted PSBT must too.
    expect(() => assertTransactionMatchesReviewed(
      parsePSBT(hunted.psbt),
      parseTransactionForIntegrity(hunted.rawtransaction),
    )).not.toThrow();
    // Everything the review renders from the response is otherwise untouched.
    expect(hunted.btc_fee).toBe(4_840);
    expect(hunted.params).toEqual(response.result.params);
  });

  it('defers a legacy software wallet to the signing-time hunt', async () => {
    const hunt = vi.fn();
    const result = await huntZeldForCompose(responseFor(enhancedSendRawTx()), { ...context, addressFormat: AddressFormat.P2PKH, hunt });
    expect(hunt).not.toHaveBeenCalled();
    expect(result.result.zeld_hunt).toMatchObject({ status: 'skipped', reason: 'A legacy transaction hunts while it is signed.' });
  });

  it('records a skipped hunt for nested SegWit when no public key is known', async () => {
    const response = responseFor(enhancedSendRawTx());
    const hunt = vi.fn();
    const result = await huntZeldForCompose(response, { ...context, addressFormat: AddressFormat.P2SH_P2WPKH, hunt });
    expect(result.result.rawtransaction).toBe(response.result.rawtransaction);
    expect(result.result.zeld_hunt).toMatchObject({ status: 'skipped', seconds: 5, target_zeros: 6 });
    expect(result.result.zeld_hunt?.reason).toContain('public key');
    expect(hunt).not.toHaveBeenCalled();
  });

  it('hunts a nested SegWit spend when the public key matches the address', async () => {
    const rawTxHex = unsignedRawTx({ outputs: [{ script: opReturnScript(), amount: 0n }, { script: SOURCE_NESTED.script, amount: 95_160n }] });
    const result = await huntZeldForCompose(responseFor(rawTxHex), {
      ...context, sourceAddress: SOURCE_NESTED.address!, addressFormat: AddressFormat.P2SH_P2WPKH, publicKeyHex: bytesToHex(PUBKEY), targetZeros: 2,
    });
    expect(result.result.zeld_hunt?.status).toBe('found');
    expect(result.result.zeld_hunt?.txid?.startsWith('00')).toBe(true);
    // The reviewed bytes are unsigned; the found txid is the signed transaction's.
    expect(parseRawTransactionLocally(result.result.rawtransaction)?.txid).not.toBe(result.result.zeld_hunt?.txid);
  });

  it('records a skipped hunt when the first output pays someone else', async () => {
    const rawTxHex = unsignedRawTx({
      outputs: [
        { script: hexToBytes('0014' + '4'.repeat(40)), amount: 5_000n },
        { script: SOURCE_P2WPKH.script, amount: 90_000n },
      ],
    });
    const result = await huntZeldForCompose(responseFor(rawTxHex), context);
    expect(result.result.zeld_hunt?.status).toBe('skipped');
    expect(result.result.rawtransaction).toBe(rawTxHex);
  });

  it('leaves the transaction as composed when the budget runs out', async () => {
    const rawTxHex = enhancedSendRawTx();
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({ status: 'not_found', attempts: 12_345, elapsedMs: 5_000 }));
    const result = await huntZeldForCompose(responseFor(rawTxHex), { ...context, hunt });
    expect(result.result.rawtransaction).toBe(rawTxHex);
    expect(result.result.zeld_hunt).toEqual({
      status: 'not_found',
      target_zeros: 6,
      seconds: 5,
      elapsed_ms: 5_000,
      attempts: 12_345,
    });
  });

  it('returns the response untouched when aborted', async () => {
    const response = responseFor(enhancedSendRawTx());
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({ status: 'aborted', attempts: 1, elapsedMs: 1 }));
    expect(await huntZeldForCompose(response, { ...context, hunt })).toBe(response);
  });

  it('clamps the budget to the protocol cap and passes it to the hunt', async () => {
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({ status: 'not_found', attempts: 0, elapsedMs: 60_000 }));
    const result = await huntZeldForCompose(responseFor(enhancedSendRawTx()), { ...context, seconds: 600, hunt });
    expect(hunt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ seconds: 60, targetZeros: 6, stopZeros: 7 }));
    expect(result.result.zeld_hunt?.seconds).toBe(60);
  });

  it('stops at the first find when a caller names its own target, and passes the accept signal', async () => {
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({ status: 'not_found', attempts: 0, elapsedMs: 1 }));
    const accept = new AbortController();
    await huntZeldForCompose(responseFor(enhancedSendRawTx()), { ...context, targetZeros: 4, acceptEarly: accept.signal, hunt });
    expect(hunt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ targetZeros: 4, stopZeros: 4, acceptEarly: accept.signal }));
  });

  it('skips before hunting when a hardware wallet PSBT cannot carry the nonce', async () => {
    const hunt = vi.fn();
    const result = await huntZeldForCompose(
      responseFor(enhancedSendRawTx(), 'not-a-psbt'),
      { ...context, walletType: 'hardware', hunt },
    );
    expect(result.result.zeld_hunt).toMatchObject({ status: 'skipped', reason: expect.stringContaining('PSBT') });
    expect(hunt).not.toHaveBeenCalled();
  });

  it('keeps an unparseable PSBT for a software wallet, which never signs from it', async () => {
    const result = await huntZeldForCompose(
      responseFor(enhancedSendRawTx(), 'not-a-psbt'),
      { ...context, targetZeros: 1 },
    );
    expect(result.result.zeld_hunt?.status).toBe('found');
    expect(result.result.psbt).toBe('not-a-psbt');
  });

  it('refuses an unverified worker result even when its nonce is in range', async () => {
    const rawTxHex = enhancedSendRawTx();
    const hunt = vi.fn(async (): Promise<HuntTxidResult> => ({
      status: 'found', nonce: 0x8abc_def0, txid: 'unchecked', zeroCount: 6, attempts: 7, elapsedMs: 8,
    }));
    await expect(huntZeldForCompose(responseFor(rawTxHex), { ...context, hunt }))
      .rejects.toThrow('does not match the claimed rare txid');
  });
});

describe('psbtWithNonce', () => {
  it('rewrites the locktime, makes every sequence final and keeps the witness data', () => {
    const psbt = psbtHexFor(unsignedRawTx({
      inputs: [{ txid: PREV_TXID, index: 0, sequence: 0xfffffffd }],
      outputs: [{ script: opReturnScript(), amount: 0n }, { script: SOURCE_P2WPKH.script, amount: 95_160n }],
    }));
    const updated = parsePSBT(psbtWithNonce(psbt, 0x8000_0005));
    expect(updated.lockTime).toBe(0x8000_0005);
    expect(updated.getInput(0).sequence).toBe(0xffffffff);
    expect(updated.getInput(0).witnessUtxo?.amount).toBe(100_000n);
    expect(updated.outputsLength).toBe(2);
  });
});
