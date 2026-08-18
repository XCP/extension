/**
 * What a dividend costs, as counterparty-core bills it.
 *
 * Core charges two things for one dividend, and a form that quotes only the first will compose
 * transactions the node refuses. The payout is `quantity_per_unit` × each holder's balance. On top
 * of that sits a flat fee of 0.0002 XCP per distinct address paid — `dividend.validate`, live on
 * mainnet since block 330,000 (`dividend_fees` in `protocol_changes.json`), so there is no
 * pre-fee case left to support.
 *
 * The fee is always in XCP, whatever the dividend is paid in, and core checks it two different
 * ways depending on that. For a dividend in some other asset it is a separate test against the
 * sender's XCP balance; for a dividend in XCP the two come out of one balance and core tests them
 * together as `total_cost = dividend_total + fee`. That second case is what breaks a Max button:
 * dividing the whole XCP balance by the supply spends, to the satoshi, everything the fee still
 * needs.
 *
 * Every figure here is deliberately pessimistic, because the direction of the error decides
 * whether Max works. The supply is used as the payout base even though core pays less than that —
 * `no_dividend_to_self` skips the sender's own holdings and empty holders are excluded — and the
 * holder count includes the sender for the same reason. Both overstate the bill, which costs the
 * user a few satoshis of headroom; understating either costs them the transaction.
 */

import {
  calculateMaxDividendPerUnit,
  formatDecimal,
  maximum,
  multiply,
  subtract,
  toBigNumber,
} from "@/core/numeric";

/**
 * Core's `int(0.0002 * config.UNIT * holder_count)`, in XCP. Exact in satoshis (20,000), so the
 * rounding in that expression never bites.
 */
export const DIVIDEND_FEE_XCP_PER_HOLDER = "0.0002";

/**
 * The XCP fee for a dividend paid to `holderCount` addresses, or null when the count is unknown.
 *
 * Null is not zero. A failed holder lookup leaves the fee unknown, and the callers below treat
 * that as "cannot say" rather than "free" — quoting a fee of zero would put the old defect back.
 * A genuine count of zero is a fee of zero, though core rejects that dividend anyway as
 * "zero dividend".
 */
export function getDividendFeeXcp(holderCount: number | null | undefined): string | null {
  if (holderCount === null || holderCount === undefined) return null;
  if (!Number.isFinite(holderCount) || holderCount < 0) return null;
  return multiply(DIVIDEND_FEE_XCP_PER_HOLDER, holderCount).toString();
}

export interface DividendMaxInput {
  /** Display units of the dividend asset that can actually be spent. */
  spendableBalance: string | number;
  /** The paying asset's supply in base units, as `/v2/assets` reports it. */
  assetSupply: string | number;
  /** Divisibility of the asset being paid *on*, which is what scales the supply. */
  assetIsDivisible: boolean;
  /** The asset the dividend is paid in. Only whether it is XCP changes the answer. */
  dividendAsset: string;
  /** `getDividendFeeXcp(...)` — null when the holder count could not be read. */
  feeXcp: string | null;
}

/**
 * The largest `quantity_per_unit` this balance can actually pay, to 8 decimal places.
 *
 * For an XCP dividend the fee comes off the top first, because core spends both from the one
 * balance. For any other dividend asset the fee is charged elsewhere and the whole balance is
 * available — see `describeDividendFeeShortfall` for the check that belongs with that case.
 *
 * An unknown fee is not subtracted. It could only be guessed at, and a Max withheld because a
 * holder-count lookup failed is a worse answer than one that is occasionally a fee too high; the
 * transaction still fails safely at compose in that case, which is where it failed before.
 */
export function getMaxDividendPerUnit({
  spendableBalance,
  assetSupply,
  assetIsDivisible,
  dividendAsset,
  feeXcp,
}: DividendMaxInput): string {
  const payable =
    dividendAsset === "XCP" && feeXcp !== null
      ? maximum(subtract(spendableBalance, feeXcp), 0)
      : toBigNumber(spendableBalance);

  const perUnit = calculateMaxDividendPerUnit(payable, assetSupply, assetIsDivisible);
  // Round down: the last satoshi of a per-unit figure is multiplied by the whole supply.
  return formatDecimal(perUnit.decimalPlaces(8, 1));
}

/**
 * Why this dividend cannot be paid at all, when the XCP fee alone is more than the sender holds.
 *
 * Worth saying out loud because nothing else on the screen mentions XCP: someone paying a dividend
 * in their own token, holding none of it, sees a balance that covers the payout and a transaction
 * that fails on a fee they were never shown. `xcpBalance` is the sender's spendable XCP — the same
 * balance as the dividend balance when the dividend is itself in XCP.
 */
export function describeDividendFeeShortfall({
  feeXcp,
  xcpBalance,
}: {
  feeXcp: string | null;
  xcpBalance: string | number | null | undefined;
}): string | null {
  if (feeXcp === null) return null;
  if (xcpBalance === null || xcpBalance === undefined || xcpBalance === "") return null;
  if (!toBigNumber(xcpBalance).isLessThan(toBigNumber(feeXcp))) return null;
  return `This dividend is billed ${feeXcp} XCP in fees, at ${DIVIDEND_FEE_XCP_PER_HOLDER} XCP per holder, and you hold ${xcpBalance} XCP.`;
}

/** One line naming the fee, for a form that has room to explain the number it is charging. */
export function describeDividendFee(feeXcp: string | null, holderCount: number | null): string | null {
  if (feeXcp === null || holderCount === null) return null;
  const holders = holderCount === 1 ? "1 holder" : `${holderCount} holders`;
  return `Plus ${feeXcp} XCP in fees (${DIVIDEND_FEE_XCP_PER_HOLDER} XCP × ${holders}).`;
}
