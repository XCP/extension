/**
 * Setup shared by the review-versus-ledger files: point the wallet at the regtest stack, fund
 * throwaway keys in one block, and sign, broadcast and mine in batches.
 *
 * Each file still declares its own `vi.mock` of the UTXO module (Vitest hoists mocks per file):
 *
 *     vi.mock('@/core/bitcoin/utxo', async original =>
 *       (await import('./walletTransport')).utxoTransport(await original()));
 */

import { randomBytes } from 'node:crypto';
import type { ApiResponse } from '@/core/counterparty/compose';
import { DEFAULT_SETTINGS, setSettingsProvider } from '@/core/settings';
import {
  COUNTERPARTY, compose, ensureMinerWallet, keyFor, legacyKeyFor, mineBlocks, nestedKeyFor, type RegtestKey, rpc,
  signAsWallet, taprootKeyFor,
} from './regtestHarness';
import { installRegtestFetch } from './walletTransport';

/** Point the wallet at the regtest node and install the transport; returns the miner's address. */
export async function startWallet(): Promise<string> {
  setSettingsProvider(() => ({ ...DEFAULT_SETTINGS, counterpartyApiBase: COUNTERPARTY, allowUnconfirmedTxs: false }));
  installRegtestFetch(COUNTERPARTY);
  return ensureMinerWallet();
}

export type Format = 'P2WPKH' | 'P2PKH' | 'P2SH-P2WPKH' | 'P2TR';
export const FORMATS: Format[] = ['P2WPKH', 'P2PKH', 'P2SH-P2WPKH', 'P2TR'];

/** A throwaway key of the given address format. */
export function keyOf(format: Format, label: string): RegtestKey {
  switch (format) {
    case 'P2WPKH': return keyFor(`review ${label}`);
    case 'P2PKH': return legacyKeyFor(`review ${label}`);
    case 'P2SH-P2WPKH': return nestedKeyFor(`review ${label}`);
    case 'P2TR': return taprootKeyFor(`review taproot ${label}`);
  }
}

/** Fund every key with `outputs` UTXOs of `btcEach`, all in one block. */
export async function fundAll(miner: string, keys: RegtestKey[], btcEach = 1, outputs = 3): Promise<void> {
  for (let i = 0; i < outputs; i++) {
    const amounts: Record<string, number> = {};
    for (const key of keys) amounts[key.address] = btcEach;
    await rpc('sendmany', ['', amounts]);
  }
  await mineBlocks(1, miner);
}

/** A fresh named asset for this run: the chain outlives runs, so names must not repeat. */
export function freshAsset(prefix: string): string {
  const letters = [...randomBytes(12)].map(byte => String.fromCharCode(65 + (byte % 26))).join('');
  return `${prefix}${letters}`.slice(0, 12);
}

export interface Signed { hex: string; txid: string }

/** Sign each composed transaction with the production signer. */
export async function signAll(items: Array<{ response: ApiResponse; key: RegtestKey }>): Promise<Signed[]> {
  const signed: Signed[] = [];
  for (const item of items) signed.push(await signAsWallet(item.response, item.key));
  return signed;
}

/** Broadcast every transaction and mine them into one block. Throws if the node refuses any. */
export async function broadcastBatch(signed: Signed[], miner: string): Promise<string[]> {
  const txids: string[] = [];
  for (const tx of signed) {
    const [acceptance] = await rpc<Array<{ allowed: boolean; 'reject-reason'?: string }>>('testmempoolaccept', [[tx.hex]]);
    if (!acceptance?.allowed) throw new Error(`testmempoolaccept refused ${tx.txid}: ${acceptance?.['reject-reason'] ?? 'unknown'}`);
    txids.push(await rpc<string>('sendrawtransaction', [tx.hex]));
  }
  await mineBlocks(1, miner);
  return txids;
}

/**
 * Burn once from every key for XCP, all in one block. Blocks are what this suite spends its time
 * on (Core parses each one before the next step), so setup burns together rather than one by one.
 */
export async function burnAll(miner: string, keys: RegtestKey[]): Promise<void> {
  const signed: Signed[] = [];
  for (const key of keys) signed.push(await signAsWallet(await compose(key.address, 'burn', { quantity: '100000000' }), key));
  await broadcastBatch(signed, miner);
}
