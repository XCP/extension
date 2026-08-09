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

import {
  divide,
  fromSatoshis,
  isGreaterThan,
  maximum,
  multiply,
  roundDown,
  subtract,
} from "@/core/numeric";

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

/**
 * The fields of a fairminter — or of a fairminter message's params — that decide the destination.
 *
 * Both spellings of each quantity are accepted because only zero-ness is read, so the base-unit and
 * normalized figures answer the question equally well and callers have whichever core gave them.
 * `pool_quantity` in particular has no `_normalized` companion on the fairminters endpoint.
 */
export interface FairminterPaymentFields {
  price?: string | number | null;
  price_normalized?: string | null;
  burn_payment?: boolean | null;
  pool_quantity?: string | number | null;
  pool_quantity_normalized?: string | null;
}

/**
 * The payment model of a fairminter as core reports it.
 *
 * This exists because the extraction is the part that goes wrong, not the rule. Four screens each
 * spelled out `{price, burnPayment}` by hand and three of them omitted `poolQuantity`, so the
 * `pool` branch below was unreachable from the entire fairmint flow: LAUNCHCOIN, which sets
 * `pool_quantity` to 31,000,000 XCP, described itself as "XCP Fee (to issuer)" and named the
 * issuer's address under "Paid to" — an address that receives none of it. The form, the summary and
 * the review screen were all wrong together, which is the pairing that matters, because the review
 * screen is the one being signed from.
 *
 * Prefer this over calling `getFairminterPaymentModel` directly with hand-picked fields.
 */
export function readFairminterPaymentModel(
  fairminter: FairminterPaymentFields
): FairminterPaymentModel {
  return getFairminterPaymentModel({
    price: fairminter.price ?? fairminter.price_normalized,
    burnPayment: fairminter.burn_payment,
    poolQuantity: fairminter.pool_quantity ?? fairminter.pool_quantity_normalized,
  });
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

export interface FairminterLimits extends FairminterLot {
  max_mint_per_tx?: string | number | null;
  max_mint_per_tx_normalized?: string | null;
  max_mint_per_address?: string | number | null;
  max_mint_per_address_normalized?: string | null;
  hard_cap?: string | number | null;
  hard_cap_normalized?: string | null;
  /** Absent is treated as divisible, which is core's default and the conservative reading here. */
  divisible?: boolean | null;
}

/**
 * One fairminter quantity in display units, preferring core's own normalized figure.
 *
 * Not every quantity has one. `/v2/fairminters` sends `max_mint_per_address` and `pool_quantity`
 * with **no** `_normalized` companion — checked across 100 fairminters, where every other quantity
 * carried one and those two never did. Reading only the normalized spelling silently drops them:
 * the per-address bound below was skipped for every fairminter that sets one, which is the same
 * "Max offers a quantity core will reject" defect that bound was added to close.
 *
 * Falling back to base units means dividing, and only for a divisible asset. An unknown
 * divisibility is read as divisible: that under-reports the bound rather than over-reporting it,
 * so Max offers too few lots rather than too many, and compose still succeeds.
 */
function displayQuantity(
  normalized: string | null | undefined,
  base: string | number | null | undefined,
  divisible: boolean | null | undefined
): string | null {
  if (normalized !== undefined && normalized !== null && normalized !== "") return normalized;
  if (base === undefined || base === null || base === "") return null;
  return divisible === false
    ? String(base)
    : fromSatoshis(base, { removeTrailingZeros: true });
}

/**
 * How many lots can be minted in one transaction, given a balance to spend.
 *
 * Every bound core checks, in lots, so the Max button cannot offer a quantity core will reject:
 * what the balance affords, `max_mint_per_tx`, what is left under the hard cap, and what is left
 * of this address's allowance. The dispense form does the same with
 * `Math.min(affordableDispenses, remainingDispenses)`; this had only checked the first two.
 *
 * Bounds whose inputs are absent are skipped rather than guessed — an unknown supply is not a full
 * cap. Those cases still fail at compose, which is the safe direction.
 */
export function getMaxFairmintLots({
  fairminter,
  balance,
  assetSupply,
  alreadyMinted,
}: {
  fairminter: FairminterLimits;
  /** XCP available to spend. */
  balance: string | number;
  /** Current supply of the asset, for the hard-cap headroom. */
  assetSupply?: string | number | null;
  /** What this address has already minted, for the per-address allowance. */
  alreadyMinted?: string | number | null;
}): string {
  const lotSize = fairminter.quantity_by_price_normalized;
  const lotCost = getFairminterLotCost(fairminter);
  if (!lotSize || !isGreaterThan(lotSize, 0) || !isGreaterThan(lotCost, 0)) return "0";

  let lots = roundDown(divide(balance, lotCost));

  const capBy = (quantity: string | number | null | undefined) => {
    if (quantity === undefined || quantity === null || quantity === "") return;
    const allowed = roundDown(divide(quantity, lotSize));
    if (allowed.isLessThan(lots)) lots = allowed;
  };

  const divisible = fairminter.divisible;
  const perTx = displayQuantity(
    fairminter.max_mint_per_tx_normalized,
    fairminter.max_mint_per_tx,
    divisible
  );
  const hardCap = displayQuantity(
    fairminter.hard_cap_normalized,
    fairminter.hard_cap,
    divisible
  );
  // The one core never normalizes, and so the one that used to be dropped entirely.
  const perAddress = displayQuantity(
    fairminter.max_mint_per_address_normalized,
    fairminter.max_mint_per_address,
    divisible
  );

  capBy(perTx);

  if (hardCap && isGreaterThan(hardCap, 0)) {
    if (assetSupply !== undefined && assetSupply !== null) {
      capBy(subtract(hardCap, assetSupply).toString());
    }
  }
  if (perAddress && isGreaterThan(perAddress, 0)) {
    capBy(subtract(perAddress, alreadyMinted ?? 0).toString());
  }

  return maximum(lots, 0).toString();
}

/** The protocol quantity a number of lots composes to. */
export function getQuantityForLots(
  fairminter: FairminterLot,
  lots: string | number
): string {
  const lotSize = fairminter.quantity_by_price_normalized;
  if (!lotSize || !isGreaterThan(lots, 0)) return "0";
  return multiply(lots, lotSize).toString();
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
