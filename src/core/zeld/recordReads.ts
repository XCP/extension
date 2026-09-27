/**
 * Keep the wallet's ZELD record (`knownOutpoints.ts`) in step with what the indexer says.
 *
 * Each extension context that reads balances installs this once from its composition root, with
 * the call that reaches the keychain from there: the background calls the wallet service itself,
 * the popup and side panel go through its client. Every fresh indexer answer for an address then
 * replaces what the record holds for it. Best effort: a failed write leaves the older record.
 *
 * Kept free of transaction parsing so the popup's entry point can install it without loading
 * @scure/btc-signer; what a broadcast does to the record lives in `recordAfterBroadcast.ts`.
 */

import { setZeldUtxoReadListener, type ZeldUtxo } from '@/core/zeld/api';
import type { ZeldOutpointUpdate } from '@/core/zeld/knownOutpoints';

/** The record update an indexer answer amounts to: exactly these outpoints, with their amounts. */
export function zeldRecordFromIndexer(utxos: readonly ZeldUtxo[]): ZeldOutpointUpdate {
  return { replace: utxos.map(utxo => ({ outpoint: `${utxo.txid.toLowerCase()}:${utxo.vout}`, balance: utxo.balance.toString() })) };
}

export function recordZeldReads(record: (address: string, update: ZeldOutpointUpdate) => Promise<void>): void {
  setZeldUtxoReadListener((address, utxos) => {
    void record(address, zeldRecordFromIndexer(utxos)).catch(() => {});
  });
}
