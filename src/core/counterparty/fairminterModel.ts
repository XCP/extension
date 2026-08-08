/**
 * Where the XCP paid for a fairmint ends up, and what to call it.
 *
 * The rule is core's, from `perform_fairmint_soft_cap_operations` in messages/fairminter.py, which
 * picks the destination in this order: refund if the soft cap was missed, else a liquidity pool if
 * one was requested, else burned if burn_payment is set, else the fairminter's issuer.
 *
 * `burn_payment` is a plain boolean in core — burned versus paid to the issuer — and being free is
 * `price == 0`, independent of it. Reading a false `burn_payment` as "free" is wrong for every
 * fairminter not created by this extension: an ordinary pay-the-issuer mint reports itself as
 * costing nothing but miner fees. Price is therefore the first question asked here, not the last.
 */

import { divide, fromSatoshis, isGreaterThan, multiply } from "@/core/numeric";

export type FairminterPaymentModel =
  /** price 0: the miner fee is the whole cost. */
  | "free"
  /** XCP is destroyed. */
  | "burned"
  /** XCP seeds a liquidity pool for the asset. */
  | "pool"
  /** XCP goes to the address that opened the fairminter. */
  | "issuer";

export interface FairminterPaymentInput {
  /** Price per lot. Either the normalized or the base-unit figure; only zero-ness is read. */
  price?: string | number | null;
  burnPayment?: boolean | null;
  /** XCP set aside to open a pool once the soft cap is reached. */
  poolQuantity?: string | number | null;
}

export function getFairminterPaymentModel({
  price,
  burnPayment,
  poolQuantity,
}: FairminterPaymentInput): FairminterPaymentModel {
  // Only a price we can actually read as zero makes this free. An absent price is not evidence of
  // one, so it falls through to the destination questions rather than claiming the mint is free.
  if (price !== undefined && price !== null && price !== "" && !isGreaterThan(price, 0)) {
    return "free";
  }
  if (poolQuantity !== undefined && poolQuantity !== null && isGreaterThan(poolQuantity, 0)) {
    return "pool";
  }
  return burnPayment ? "burned" : "issuer";
}

const LABELS: Record<FairminterPaymentModel, string> = {
  free: "BTC Fee Only (to miners)",
  burned: "XCP Fee (burned)",
  pool: "XCP Fee (to liquidity pool)",
  issuer: "XCP Fee (to issuer)",
};

export function describeFairminterPaymentModel(model: FairminterPaymentModel): string {
  return LABELS[model];
}

/** Whether this model charges XCP at all, i.e. whether a price and lot size are worth showing. */
export function isPaidFairminter(model: FairminterPaymentModel): boolean {
  return model !== "free";
}

export interface FairminterLot {
  /** XCP charged per lot, in base units — core's own figure. */
  price?: number | string | null;
  /** XCP per whole unit, which core derives as price / quantity_by_price. */
  price_normalized?: string | null;
  /** Assets released per lot paid for. */
  quantity_by_price_normalized?: string | null;
  asset?: string;
}

/**
 * What one lot costs, in XCP.
 *
 * Prefers core's `price`, which is already per-lot: `price_normalized` is that figure divided by
 * the lot size, so multiplying it back up is a round trip through a division that does not always
 * terminate. A lot size of 3 at 1 XCP gives a per-unit price of 0.333…, and the product of the
 * rounded value is not 1 again.
 */
export function getFairminterLotCost(fairminter: FairminterLot): string {
  if (fairminter.price !== undefined && fairminter.price !== null && fairminter.price !== "") {
    return fromSatoshis(fairminter.price, { removeTrailingZeros: true });
  }
  return multiply(
    fairminter.price_normalized ?? 0,
    fairminter.quantity_by_price_normalized ?? 0
  ).toString();
}

/**
 * What minting `quantity` of the asset costs, in XCP, or null if it cannot be known.
 *
 * Core charges `ceil(quantity / quantity_by_price * price)` — a whole number of lots, since it
 * rejects any quantity that is not a multiple of the lot size. Computed the same way round here,
 * as lots first, so the figure shown is the figure charged.
 *
 * Returns null rather than assuming a lot size of 1 when the field is absent: that assumption
 * multiplies the cost by the real lot size, and a payment figure that is wrong by a factor is
 * worse on a signing screen than no figure at all.
 */
export function getFairmintCost(
  fairminter: FairminterLot,
  quantity: string | number
): string | null {
  const lotSize = fairminter.quantity_by_price_normalized;
  if (lotSize === undefined || lotSize === null || !isGreaterThan(lotSize, 0)) return null;
  if (!isGreaterThan(quantity, 0)) return "0";
  return multiply(divide(quantity, lotSize), getFairminterLotCost(fairminter)).toString();
}

/** One line naming what a single mint costs and yields, for a list row. */
export function describeFairminterLot(fairminter: FairminterLot): string {
  if (!isGreaterThan(getFairminterLotCost(fairminter), 0)) {
    return "Free mint (BTC fees only)";
  }
  const lotSize = fairminter.quantity_by_price_normalized ?? "1";
  const asset = fairminter.asset ?? "";
  return `${getFairminterLotCost(fairminter)} XCP per ${lotSize}${asset ? ` ${asset}` : ""}`;
}
