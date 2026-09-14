// @vitest-environment node

/**
 * End-to-end proof on regtest that a hunted transaction is still the Counterparty transaction it
 * was composed as.
 *
 * Runs the wallet's own compose-time hunt against a live Bitcoin Core + Counterparty Core stack,
 * signs the hunted bytes the way the wallet does, broadcasts them, mines them, and reads back what
 * Counterparty made of them. Three shapes are exercised:
 *
 * 1. A broadcast (OP_RETURN data, then change): hunted, and parsed as a valid broadcast.
 * 2. A burn (burn address first, then change): the hunt refuses it, because the first spendable
 *    output is not ours, and the transaction is still a valid burn.
 * 3. An enhanced XCP send (OP_RETURN data, then change): hunted, and parsed as a valid send.
 *
 * Prerequisites: a regtest stack on localhost with RPC user `rpc`/`rpc`, e.g. the compose file in
 * the PR description (Bitcoin Core 30, Counterparty Core 11.3). Then:
 *
 *   ZELD_REGTEST=1 ZELD_REGTEST_ZEROS=6 npx vitest run e2e/zeld/regtest-hunt.test.ts
 *
 * At six zeros a single thread needs a few minutes; ZELD_REGTEST_ZEROS=4 proves the same
 * Counterparty handling in seconds.
 */

import { writeFileSync } from 'node:fs';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import * as secp256k1 from '@noble/secp256k1';
import { hashes } from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import type { ApiResponse } from '@/core/counterparty/compose';
import { huntZeldForCompose } from '@/core/zeld/composeHunt';
import { huntTxid } from '@/core/zeld/hunt';
import { countLeadingZeroNibbles } from '@/core/zeld/protocol';

// noble-secp256k1 v3 signs only once told which hash to use, as the wallet's signers do.
if (!hashes.sha256) hashes.sha256 = (msg) => new Uint8Array(sha256(msg));
if (!hashes.hmacSha256) hashes.hmacSha256 = (key, msg) => new Uint8Array(hmac(sha256, key, msg));

const enabled = process.env.ZELD_REGTEST === '1';
const targetZeros = Number(process.env.ZELD_REGTEST_ZEROS ?? 6);
const BITCOIND = process.env.ZELD_REGTEST_BITCOIND ?? 'http://127.0.0.1:18443';
const COUNTERPARTY = process.env.ZELD_REGTEST_COUNTERPARTY ?? 'http://127.0.0.1:24000';
const MINER_WALLET = 'miner';
const REGTEST = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };

// A throwaway key that only ever holds regtest coins, fresh per run so Counterparty's one-burn-
// per-address rule and earlier runs' UTXOs never bleed into this one.
const RUN_ID = process.env.ZELD_REGTEST_RUN ?? String(Date.now());
const HUNTER_PRIVATE_KEY = sha256(utf8ToBytes(`xcp-wallet zeld regtest hunter ${RUN_ID}`));
const HUNTER_PUBLIC_KEY = secp256k1.getPublicKey(HUNTER_PRIVATE_KEY, true);
const HUNTER = btc.p2wpkh(HUNTER_PUBLIC_KEY, REGTEST);
const HUNTER_ADDRESS = HUNTER.address!;

async function rpc<T = unknown>(method: string, params: unknown[] = [], wallet: string | null = MINER_WALLET): Promise<T> {
  const response = await fetch(wallet ? `${BITCOIND}/wallet/${wallet}` : BITCOIND, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from('rpc:rpc').toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'zeld', method, params }),
  });
  const body = await response.json() as { result: T; error: { message: string } | null };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function counterparty<T = unknown>(path: string): Promise<T> {
  const response = await fetch(`${COUNTERPARTY}/v2${path}`);
  const body = await response.json() as { result?: T; error?: string };
  if (body.error) throw new Error(`${path}: ${body.error}`);
  return body.result as T;
}

async function waitForCounterparty(height: number): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const status = await counterparty<{ counterparty_height: number }>('/');
    if (status.counterparty_height >= height) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Counterparty did not reach block ${height}`);
}

async function mineBlocks(count: number, address: string): Promise<void> {
  await rpc('generatetoaddress', [count, address]);
  await waitForCounterparty(await rpc<number>('getblockcount', []));
}

async function ensureMinerWallet(): Promise<string> {
  const wallets = await rpc<string[]>('listwallets', [], null);
  if (!wallets.includes(MINER_WALLET)) {
    try {
      await rpc('loadwallet', [MINER_WALLET], null);
    } catch {
      await rpc('createwallet', [MINER_WALLET, false, false, '', false, true], null);
    }
  }
  return rpc<string>('getnewaddress', ['', 'bech32']);
}

/** Sign the way the wallet's software signer does: SIGHASH_ALL over API-provided witness UTXOs. */
function signAsWallet(response: ApiResponse): { hex: string; txid: string } {
  const tx = btc.Transaction.fromRaw(hexToBytes(response.result.rawtransaction), {
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
  });
  for (let index = 0; index < tx.inputsLength; index++) {
    tx.updateInput(index, {
      witnessUtxo: {
        script: hexToBytes(response.result.lock_scripts[index]!),
        amount: BigInt(response.result.inputs_values[index]!),
      },
    });
  }
  tx.sign(HUNTER_PRIVATE_KEY);
  tx.finalize();
  return { hex: tx.hex, txid: tx.id };
}

/** The hunter's confirmed outpoints, read from the UTXO set the way the wallet reads its own. */
async function hunterInputsSet(): Promise<string> {
  const scan = await rpc<{ unspents: Array<{ txid: string; vout: number }> }>(
    'scantxoutset', ['start', [{ desc: `addr(${HUNTER_ADDRESS})` }]], null,
  );
  if (scan.unspents.length === 0) throw new Error('the hunter has no confirmed UTXOs');
  return scan.unspents.map(utxo => `${utxo.txid}:${utxo.vout}`).join(',');
}

async function compose(endpoint: string, params: Record<string, string>): Promise<ApiResponse> {
  // The regtest node has no Electrs, so the composer is told which UTXOs to spend, as the wallet
  // itself does after local coin selection.
  const query = new URLSearchParams({
    ...params, inputs_set: await hunterInputsSet(), sat_per_vbyte: '2', verbose: 'true',
  });
  const result = await counterparty<ApiResponse['result']>(`/addresses/${HUNTER_ADDRESS}/compose/${endpoint}?${query}`);
  return { result };
}

function huntAsWallet(response: ApiResponse): Promise<ApiResponse> {
  return huntZeldForCompose(response, {
    sourceAddress: HUNTER_ADDRESS,
    addressFormat: AddressFormat.P2WPKH,
    walletType: 'mnemonic',
    seconds: 60,
    targetZeros,
    // One thread under vitest has no Web Workers; give it the time a worker pool would not need.
    hunt: (template, options) => huntTxid(template, {
      ...options,
      seconds: 1_800,
      createWorker: () => null,
      batchSize: 200_000,
    }),
  });
}

async function broadcastAndMine(hex: string, expectedTxid: string, minerAddress: string): Promise<void> {
  const [acceptance] = await rpc<Array<{ allowed: boolean; 'reject-reason'?: string }>>('testmempoolaccept', [[hex]]);
  expect(acceptance, 'testmempoolaccept').toMatchObject({ allowed: true });
  const txid = await rpc<string>('sendrawtransaction', [hex]);
  expect(txid).toBe(expectedTxid);
  await mineBlocks(1, minerAddress);
}

interface CounterpartyTransaction {
  tx_hash: string;
  supported: boolean;
  transaction_type?: string;
  valid?: boolean;
  unpacked_data?: { message_type: string; message_data?: Record<string, unknown> };
}

/** How Counterparty parsed a mined transaction; verbose so the decoded message comes along. */
function parsedTransaction(txid: string): Promise<CounterpartyTransaction> {
  return counterparty<CounterpartyTransaction>(`/transactions/${txid}?verbose=true`);
}

describe('ZELD hunt on Counterparty regtest', () => {
  it.runIf(enabled)(`hunts ${targetZeros} zeros and Counterparty still parses every message`, async () => {
    const lines: string[] = [];
    const log = (message: string, detail?: unknown) => {
      const line = `[zeld regtest] ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`;
      lines.push(line);
      console.log(line);
      // Also written to ZELD_REGTEST_OUT when set, so a CI log filter cannot lose the evidence.
      if (process.env.ZELD_REGTEST_OUT) writeFileSync(process.env.ZELD_REGTEST_OUT, `${lines.join('\n')}\n`);
    };

    const minerAddress = await ensureMinerWallet();
    if (await rpc<number>('getblockcount', []) < 110) await mineBlocks(110, minerAddress);
    await waitForCounterparty(await rpc<number>('getblockcount', []));

    await rpc('sendtoaddress', [HUNTER_ADDRESS, 3]);
    await mineBlocks(1, minerAddress);
    log('funded', { hunter: HUNTER_ADDRESS });

    // 1. Broadcast: data output first, change second. Hunted.
    const broadcast = await huntAsWallet(await compose('broadcast', {
      text: 'ZELD hunt regtest', value: '0', fee_fraction: '0', encoding: 'opreturn',
    }));
    expect(broadcast.result.zeld_hunt?.status).toBe('found');
    expect(countLeadingZeroNibbles(broadcast.result.zeld_hunt!.txid!)).toBeGreaterThanOrEqual(targetZeros);
    const signedBroadcast = signAsWallet(broadcast);
    expect(signedBroadcast.txid).toBe(broadcast.result.zeld_hunt!.txid);
    log('broadcast hunted', broadcast.result.zeld_hunt);
    await broadcastAndMine(signedBroadcast.hex, signedBroadcast.txid, minerAddress);
    const parsedBroadcast = await parsedTransaction(signedBroadcast.txid);
    expect(parsedBroadcast.supported).toBe(true);
    expect(parsedBroadcast.unpacked_data?.message_type).toBe('broadcast');
    const broadcasts = await counterparty<Array<{ text: string; tx_hash: string }>>(`/addresses/${HUNTER_ADDRESS}/broadcasts`);
    expect(broadcasts.some(item => item.tx_hash === signedBroadcast.txid && item.text === 'ZELD hunt regtest')).toBe(true);
    log('broadcast parsed', { txid: signedBroadcast.txid, message_type: parsedBroadcast.unpacked_data?.message_type });

    // 2. Burn: the burn address is the first spendable output, so the hunt must refuse.
    const burn = await huntAsWallet(await compose('burn', { quantity: '100000000' }));
    expect(burn.result.zeld_hunt).toMatchObject({ status: 'skipped', reason: expect.stringContaining('someone else') });
    const signedBurn = signAsWallet(burn);
    await broadcastAndMine(signedBurn.hex, signedBurn.txid, minerAddress);
    const parsedBurn = await parsedTransaction(signedBurn.txid);
    expect(parsedBurn.supported).toBe(true);
    const xcp = await counterparty<Array<{ quantity: number }>>(`/addresses/${HUNTER_ADDRESS}/balances/XCP`);
    expect(xcp[0]?.quantity ?? 0).toBeGreaterThan(0);
    log('burn refused by the hunt and credited by Counterparty', { txid: signedBurn.txid, xcp: xcp[0]?.quantity });

    // 3. Enhanced send: data output first, change second. Hunted.
    const send = await huntAsWallet(await compose('send', {
      destination: minerAddress, asset: 'XCP', quantity: '100000000', use_enhanced_send: 'true', encoding: 'opreturn',
    }));
    expect(send.result.zeld_hunt?.status).toBe('found');
    const signedSend = signAsWallet(send);
    expect(signedSend.txid).toBe(send.result.zeld_hunt!.txid);
    log('send hunted', send.result.zeld_hunt);
    await broadcastAndMine(signedSend.hex, signedSend.txid, minerAddress);
    const parsedSend = await parsedTransaction(signedSend.txid);
    expect(parsedSend.supported).toBe(true);
    expect(parsedSend.unpacked_data?.message_type).toBe('enhanced_send');
    const received = await counterparty<Array<{ quantity: number }>>(`/addresses/${minerAddress}/balances/XCP`);
    expect(received[0]?.quantity).toBe(100000000);
    log('send parsed', { txid: signedSend.txid, minerXcp: received[0]?.quantity });

    // The ZELD side of every hunted transaction: input 0 carries the nonce and the first spendable
    // output, where the reward lands, is the hunter's own change.
    for (const txid of [signedBroadcast.txid, signedSend.txid]) {
      const decoded = await rpc<{ vin: Array<{ sequence: number }>; vout: Array<{ scriptPubKey: { type: string; address?: string } }> }>(
        'getrawtransaction', [txid, true],
      );
      expect(decoded.vin[0]!.sequence).toBeGreaterThanOrEqual(0x8000_0000);
      const rewardOutput = decoded.vout.find(output => output.scriptPubKey.type !== 'nulldata');
      expect(rewardOutput?.scriptPubKey.address).toBe(HUNTER_ADDRESS);
    }
    log('done', { broadcast: signedBroadcast.txid, send: signedSend.txid, hex: bytesToHex(HUNTER_PUBLIC_KEY).slice(0, 8) });
  }, 3_600_000);
});
