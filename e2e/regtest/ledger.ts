/**
 * What Counterparty Core's ledger says a mined transaction did, read from its API.
 *
 * The suite's ground truth. Every read is verbose so quantities come with Core's own normalized
 * figure, which is what the review's display-unit strings are compared against.
 */

import { toBigNumber } from '@/core/numeric';
import { counterparty, rpc } from './regtestHarness';
import { sameScript } from './walletTransport';

export interface LedgerEvent {
  event: string;
  params: Record<string, unknown> & {
    address?: string | null;
    utxo?: string | null;
    asset?: string;
    quantity?: number;
    quantity_normalized?: string;
    status?: string;
  };
}

export interface ParsedTransaction {
  tx_hash: string;
  supported: boolean;
  valid?: boolean;
  transaction_type?: string;
  unpacked_data?: { message_type: string; message_data?: Record<string, unknown> };
  btc_amount?: number;
  fee?: number;
}

export function parsedTransaction(txid: string): Promise<ParsedTransaction> {
  return counterparty<ParsedTransaction>(`/transactions/${txid}?verbose=true`);
}

/** Every event Core recorded for a transaction, oldest first. */
export async function txEvents(txid: string): Promise<LedgerEvent[]> {
  const events = await counterparty<LedgerEvent[]>(`/transactions/${txid}/events?verbose=true&limit=1000`);
  return [...events].reverse();
}

export interface Movement { holder: string; asset: string; quantity: number; normalized: string }

function movements(events: LedgerEvent[], kind: 'CREDIT' | 'DEBIT'): Movement[] {
  return events.filter(e => e.event === kind).map(e => ({
    holder: String(e.params.utxo || e.params.address),
    asset: String(e.params.asset),
    quantity: Number(e.params.quantity),
    normalized: String(e.params.quantity_normalized),
  }));
}

export const credits = (events: LedgerEvent[]) => movements(events, 'CREDIT');
export const debits = (events: LedgerEvent[]) => movements(events, 'DEBIT');

/** Sum of what a holder (address, by script, or utxo, exactly) was credited or debited in an asset. */
export function totalFor(list: Movement[], holder: string, asset: string): number {
  return list.filter(m => m.asset === asset && (m.holder === holder || (!m.holder.includes(':') && !holder.includes(':') && sameScript(m.holder, holder))))
    .reduce((sum, m) => sum + m.quantity, 0);
}

export async function balance(address: string, asset: string): Promise<number> {
  const rows = await counterparty<Array<{ quantity: number; utxo?: string | null }>>(`/addresses/${address}/balances/${asset}`);
  return rows.filter(row => !row.utxo).reduce((sum, row) => sum + row.quantity, 0);
}

export async function utxoBalances(utxo: string): Promise<Array<{ asset: string; quantity: number; quantity_normalized: string }>> {
  return counterparty(`/utxos/${utxo}/balances?verbose=true`);
}

export interface LedgerAsset {
  asset: string;
  asset_longname: string | null;
  divisible: boolean;
  locked: boolean;
  supply: number;
  supply_normalized: string;
  description: string;
  issuer: string;
  owner: string;
}

export function asset(name: string): Promise<LedgerAsset> {
  return counterparty<LedgerAsset>(`/assets/${name}?verbose=true`);
}

/** Display-unit strings are equal as numbers: "1,000.50000000" equals "1000.5". */
export function sameAmount(display: string | undefined, normalized: string | number | undefined): boolean {
  if (display === undefined || normalized === undefined) return false;
  const number = (text: string | number) => toBigNumber(String(text).replace(/,/g, '').trim().split(/\s+/)[0]!);
  const a = number(display);
  const b = number(normalized);
  return a.isFinite() && b.isFinite() && a.isEqualTo(b);
}

/** The first number in a display string, as a plain decimal: "1,234.5 XCP" gives "1234.5". */
export function amountIn(text: string): string {
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) throw new Error(`No amount in "${text}"`);
  return toBigNumber(match[0]).toFixed();
}

/** The Bitcoin fee the node says a mined transaction paid, in sats. */
export async function minedFee(txid: string): Promise<number> {
  const tx = await rpc<{ vin: Array<{ txid: string; vout: number }>; vout: Array<{ value: number }> }>('getrawtransaction', [txid, true], null);
  let inputs = 0;
  for (const input of tx.vin) {
    const parent = await rpc<{ vout: Array<{ value: number }> }>('getrawtransaction', [input.txid, true], null);
    inputs += Math.round(parent.vout[input.vout]!.value * 1e8);
  }
  return inputs - tx.vout.reduce((sum, output) => sum + Math.round(output.value * 1e8), 0);
}
