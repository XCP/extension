/**
 * What a dispense pays back, mirroring `messages/dispense.py`.
 *
 * A dispense payload is a single marker byte, so what the sender receives is decided entirely by
 * the outputs and by ledger state. Core takes each output and pays from *every* open dispenser at
 * that address — `get_dispensers(..., status_in=[0, 11], order_by="asset")` — so one payment to an
 * address running three dispensers returns three assets.
 *
 * Per dispenser:
 *
 *     must_give      = floor(btc_amount / satoshirate)
 *     remaining      = floor(give_remaining / give_quantity)
 *     actually_given = min(must_give, remaining) * give_quantity
 *
 * Shared by the compose review screen and the provider approval screen. Keep it that way: the
 * inline copy this replaced omitted the `give_remaining` cap and priced oracle dispensers with the
 * fixed-rate formula.
 */

import { fetchAddressDispensers } from '@/core/counterparty/api';
import {
  divide,
  isGreaterThan,
  isLessThan,
  isLessThanOrEqualToZero,
  minimum,
  multiply,
  roundDown,
} from '@/core/numeric';

/** Open (0) and open-with-empty-address (11) — the statuses core dispenses from. */
const DISPENSABLE_STATUSES = new Set([0, 11]);

export interface DispensePayout {
  /** Display name, preferring the subasset longname. */
  asset: string;
  /** Display-unit quantity received, or undefined when priced by an oracle. */
  quantity?: string;
  /** True when the dispenser prices in fiat via an oracle, so the payout is not fixed here. */
  oraclePriced: boolean;
  /** True when the dispenser cannot cover a full payout at this price. */
  partiallyFilled: boolean;
}

/** One line per payout, for a detail row. */
export function describePayout(p: DispensePayout): string {
  if (p.oraclePriced) return `${p.asset} — priced by oracle at settlement`;
  const amount = p.quantity ?? 'amount unavailable';
  return p.partiallyFilled
    ? `${amount} ${p.asset} (all the dispenser has left)`
    : `${amount} ${p.asset}`;
}

/**
 * Every open dispenser at an address, and what each pays for this many satoshis.
 *
 * Shared by the compose review screen and the provider approval screen.
 */
export async function resolveDispensersAt(
  address: string,
  satoshis: number
): Promise<DispensePayout[]> {
  let dispensers: NonNullable<Awaited<ReturnType<typeof fetchAddressDispensers>>['result']>;
  try {
    const response = await fetchAddressDispensers(address, { limit: 50 });
    dispensers = response.result ?? [];
  } catch {
    // A lookup failure is not evidence of anything; the caller says nothing rather than implying
    // the address has no dispenser.
    return [];
  }

  const open = dispensers.filter(
    (d) =>
      DISPENSABLE_STATUSES.has(d.status) &&
      isGreaterThan(String(d.satoshirate), 0) &&
      isGreaterThan(String(d.give_quantity), 0)
  );

  // Core processes them in asset order, and pays from each in turn.
  const ordered = [...open].sort((a, b) => a.asset.localeCompare(b.asset));

  const payouts: DispensePayout[] = [];
  for (const d of ordered) {
    const name = d.asset_info?.asset_longname || d.asset;

    if ((d as { oracle_address?: string | null }).oracle_address) {
      payouts.push({ asset: name, oraclePriced: true, partiallyFilled: false });
      continue;
    }

    const mustGive = roundDown(divide(satoshis, String(d.satoshirate)));
    const remaining = roundDown(divide(String(d.give_remaining), String(d.give_quantity)));
    const lots = minimum(mustGive, remaining);

    if (isLessThanOrEqualToZero(lots)) continue;

    // The API's normalized figure carries the asset's divisibility, which the raw quantity does
    // not; scaling the lot count by it keeps this out of the 1e8 guessing business.
    const perLot = d.give_quantity_normalized;
    payouts.push({
      asset: name,
      ...(perLot !== undefined && perLot !== null
        ? { quantity: multiply(lots, String(perLot)).toFixed() }
        : {}),
      oraclePriced: false,
      partiallyFilled: isLessThan(remaining, mustGive),
    });
  }

  return payouts;
}
