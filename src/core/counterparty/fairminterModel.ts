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

import { isGreaterThan } from "@/core/numeric";

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
