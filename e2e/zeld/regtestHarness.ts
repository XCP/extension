/**
 * Shared plumbing for the ZELD regtest proofs: a Bitcoin Core RPC client, a Counterparty API
 * client, throwaway keys, and the sign-broadcast-mine cycle the wallet's own signer performs.
 *
 * Expects the stack described in the PR (Bitcoin Core 30 and Counterparty Core 11.3 on regtest,
 * RPC user `rpc`/`rpc`); override the endpoints with ZELD_REGTEST_BITCOIND and
 * ZELD_REGTEST_COUNTERPARTY.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import * as secp256k1 from '@noble/secp256k1';
import { hashes } from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { AddressFormat } from '@/core/bitcoin/address';
import type { ApiResponse } from '@/core/counterparty/compose';
import { huntZeldForCompose } from '@/core/zeld/composeHunt';
import { huntTxid } from '@/core/zeld/hunt';

// noble-secp256k1 v3 signs only once told which hash to use, as the wallet's signers do.
if (!hashes.sha256) hashes.sha256 = (msg) => new Uint8Array(sha256(msg));
if (!hashes.hmacSha256) hashes.hmacSha256 = (key, msg) => new Uint8Array(hmac(sha256, key, msg));

export const REGTEST_ENABLED = process.env.ZELD_REGTEST === '1';
const BITCOIND = process.env.ZELD_REGTEST_BITCOIND ?? 'http://127.0.0.1:18443';
const COUNTERPARTY = process.env.ZELD_REGTEST_COUNTERPARTY ?? 'http://127.0.0.1:24000';
const MINER_WALLET = 'miner';
const REGTEST = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };
/** Fresh per run so Counterparty's one-burn-per-address rule and earlier runs' UTXOs never bleed in. */
const RUN_ID = process.env.ZELD_REGTEST_RUN ?? String(Date.now());

export interface RegtestKey {
  privateKey: Uint8Array;
  address: string;
  script: Uint8Array;
  scriptHex: string;
}

/** A throwaway P2WPKH key that only ever holds regtest coins. */
export function keyFor(label: string): RegtestKey {
  const privateKey = sha256(utf8ToBytes(`xcp-wallet zeld regtest ${label} ${RUN_ID}`));
  const payment = btc.p2wpkh(secp256k1.getPublicKey(privateKey, true), REGTEST);
  return { privateKey, address: payment.address!, script: payment.script, scriptHex: Buffer.from(payment.script).toString('hex') };
}

export async function rpc<T = unknown>(method: string, params: unknown[] = [], wallet: string | null = MINER_WALLET): Promise<T> {
  const response = await fetch(wallet ? `${BITCOIND}/wallet/${wallet}` : BITCOIND, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from('rpc:rpc').toString('base64')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'zeld', method, params }),
  });
  const body = await response.json() as { result: T; error: { message: string } | null };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

export async function counterparty<T = unknown>(path: string): Promise<T> {
  const response = await fetch(`${COUNTERPARTY}/v2${path}`);
  const body = await response.json() as { result?: T; error?: string };
  if (body.error) throw new Error(`${path}: ${body.error}`);
  return body.result as T;
}

export async function waitForCounterparty(height: number): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const status = await counterparty<{ counterparty_height: number }>('/');
    if (status.counterparty_height >= height) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Counterparty did not reach block ${height}`);
}

export async function mineBlocks(count: number, address: string): Promise<void> {
  await rpc('generatetoaddress', [count, address]);
  await waitForCounterparty(await rpc<number>('getblockcount', []));
}

/** The node's own wallet, which mines and funds the throwaway keys. Returns a fresh address. */
export async function ensureMinerWallet(): Promise<string> {
  const wallets = await rpc<string[]>('listwallets', [], null);
  if (!wallets.includes(MINER_WALLET)) {
    try {
      await rpc('loadwallet', [MINER_WALLET], null);
    } catch {
      await rpc('createwallet', [MINER_WALLET, false, false, '', false, true], null);
    }
  }
  const address = await rpc<string>('getnewaddress', ['', 'bech32']);
  if (await rpc<number>('getblockcount', []) < 110) await mineBlocks(110, address);
  await waitForCounterparty(await rpc<number>('getblockcount', []));
  return address;
}

export async function fund(minerAddress: string, keys: RegtestKey[], btcEach: number): Promise<void> {
  for (const key of keys) await rpc('sendtoaddress', [key.address, btcEach]);
  await mineBlocks(1, minerAddress);
}

/** Confirmed outpoints of an address, read from the UTXO set the way the wallet reads its own. */
export async function inputsSetFor(address: string): Promise<string> {
  const scan = await rpc<{ unspents: Array<{ txid: string; vout: number }> }>('scantxoutset', ['start', [{ desc: `addr(${address})` }]], null);
  if (scan.unspents.length === 0) throw new Error(`${address} has no confirmed UTXOs`);
  return scan.unspents.map(utxo => `${utxo.txid}:${utxo.vout}`).join(',');
}

/** Compose through Counterparty's real API. The regtest node has no Electrs, so inputs are named. */
export async function compose(address: string, endpoint: string, params: Record<string, string>): Promise<ApiResponse> {
  const query = new URLSearchParams({ ...params, inputs_set: await inputsSetFor(address), sat_per_vbyte: '2', verbose: 'true' });
  const result = await counterparty<ApiResponse['result']>(`/addresses/${address}/compose/${endpoint}?${query}`);
  return { result };
}

/** Sign the way the wallet's software signer does: SIGHASH_ALL over API-provided witness UTXOs. */
export function signAsWallet(response: ApiResponse, key: RegtestKey): { hex: string; txid: string } {
  const tx = btc.Transaction.fromRaw(hexToBytes(response.result.rawtransaction), { allowUnknownOutputs: true, allowUnknownInputs: true });
  for (let index = 0; index < tx.inputsLength; index++) {
    tx.updateInput(index, {
      witnessUtxo: { script: hexToBytes(response.result.lock_scripts[index]!), amount: BigInt(response.result.inputs_values[index]!) },
    });
  }
  tx.sign(key.privateKey);
  tx.finalize();
  return { hex: tx.hex, txid: tx.id };
}

/** Run the wallet's compose-time hunt on one thread, with enough time for any target. */
export function huntAsWallet(response: ApiResponse, key: RegtestKey, targetZeros: number): Promise<ApiResponse> {
  return huntZeldForCompose(response, {
    sourceAddress: key.address,
    addressFormat: AddressFormat.P2WPKH,
    walletType: 'mnemonic',
    seconds: 60,
    targetZeros,
    hunt: (template, options) => huntTxid(template, { ...options, seconds: 1_800, createWorker: () => null, batchSize: 200_000 }),
  });
}

/** Mempool-accept, broadcast, mine, and wait for Counterparty. Throws if the node refuses. */
export async function broadcastAndMine(hex: string, minerAddress: string): Promise<string> {
  const [acceptance] = await rpc<Array<{ allowed: boolean; 'reject-reason'?: string }>>('testmempoolaccept', [[hex]]);
  if (!acceptance?.allowed) throw new Error(`testmempoolaccept refused: ${acceptance?.['reject-reason'] ?? 'unknown'}`);
  const txid = await rpc<string>('sendrawtransaction', [hex]);
  await mineBlocks(1, minerAddress);
  return txid;
}

export interface CounterpartyTransaction {
  tx_hash: string;
  supported: boolean;
  transaction_type?: string;
  valid?: boolean;
  unpacked_data?: { message_type: string; message_data?: Record<string, unknown> };
}

/** How Counterparty parsed a mined transaction; verbose so the decoded message comes along. */
export function parsedTransaction(txid: string): Promise<CounterpartyTransaction> {
  return counterparty<CounterpartyTransaction>(`/transactions/${txid}?verbose=true`);
}

export async function xcpBalance(address: string): Promise<number> {
  const balances = await counterparty<Array<{ quantity: number }>>(`/addresses/${address}/balances/XCP`);
  return balances[0]?.quantity ?? 0;
}

/** Burn once for XCP; a second burn from the same address is refused by Counterparty. */
export async function ensureXcp(key: RegtestKey, minerAddress: string): Promise<void> {
  if (await xcpBalance(key.address) > 0) return;
  const burn = signAsWallet(await compose(key.address, 'burn', { quantity: '100000000' }), key);
  await broadcastAndMine(burn.hex, minerAddress);
}
