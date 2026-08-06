/**
 * What a dispense actually returns.
 *
 * A dispense carries no payload worth reading — one marker byte — so the message says nothing about
 * what the sender receives. The answer is entirely in the outputs and in ledger state: core takes
 * each output, looks up **every** open dispenser at that address
 * (`messages/dispense.py`: `get_dispensers(..., status_in=[0, 11], order_by="asset")`) and pays out
 * from each in turn. One payment to an address running three dispensers returns three assets.
 *
 * That is the part a person cannot work out from the screen. The BTC leaving is visible in the
 * outputs; what comes back is not, and "Trigger a dispenser" was the whole description.
 *
 * Payout per dispenser, from `dispense.py`:
 *
 *     must_give      = floor(btc_amount / satoshirate)
 *     remaining      = floor(give_remaining / give_quantity)
 *     actually_given = min(must_give, remaining) * give_quantity
 *
 * The compose review screen worked this out inline and diverged from core twice: it never applied
 * the `give_remaining` cap, so a nearly-empty dispenser was quoted at its full rate, and it priced
 * oracle dispensers with the fixed-rate formula, which is not what they charge. Both screens now
 * read from here, because two implementations of one rule is how a fix lands in only one of them.
 *
 * Oracle dispensers price in fiat against the oracle's last broadcast, so their payout depends on a
 * value that can change before the transaction confirms. Those are reported as oracle-priced rather
 * than given a number this wallet cannot stand behind.
 */

import BigNumber from 'bignumber.js';
import { fetchAddressDispensers } from '@/core/counterparty/api';

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
  let dispensers;
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
      new BigNumber(String(d.satoshirate)).isGreaterThan(0) &&
      new BigNumber(String(d.give_quantity)).isGreaterThan(0)
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

    const giveQuantity = new BigNumber(String(d.give_quantity));
    const mustGive = new BigNumber(satoshis)
      .dividedBy(String(d.satoshirate))
      .integerValue(BigNumber.ROUND_FLOOR);
    const remaining = new BigNumber(String(d.give_remaining))
      .dividedBy(giveQuantity)
      .integerValue(BigNumber.ROUND_FLOOR);
    const lots = BigNumber.min(mustGive, remaining);

    if (lots.isLessThanOrEqualTo(0)) continue;

    // The API's normalized figure carries the asset's divisibility, which the raw quantity does
    // not; scaling the lot count by it keeps this out of the 1e8 guessing business.
    const perLot = d.give_quantity_normalized;
    payouts.push({
      asset: name,
      ...(perLot !== undefined && perLot !== null
        ? { quantity: lots.multipliedBy(String(perLot)).toFixed() }
        : {}),
      oraclePriced: false,
      partiallyFilled: remaining.isLessThan(mustGive),
    });
  }

  return payouts;
}

export interface DispenseOutcome {
  address: string;
  satoshis: number;
  payouts: DispensePayout[];
  /** True when the address has no dispenser this payment can trigger. */
  nothingToTrigger: boolean;
}

interface OutputLike {
  address?: string;
  value: number;
}

/**
 * @param outputs - the transaction's outputs; each paying a foreign address is a potential trigger
 * @param signerAddresses - outputs back to the signer are change, not payment
 */
export async function resolveDispenseOutcome(
  outputs: OutputLike[],
  signerAddresses: string[]
): Promise<DispenseOutcome[]> {
  const mine = new Set(signerAddresses);
  const paid = outputs.filter((o) => o.address && !mine.has(o.address) && o.value > 0);

  const outcomes: DispenseOutcome[] = [];
  for (const output of paid) {
    const address = output.address as string;
    const payouts = await resolveDispensersAt(address, output.value);
    outcomes.push({
      address,
      satoshis: output.value,
      payouts,
      nothingToTrigger: payouts.length === 0,
    });
  }

  return outcomes;
}
