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

export interface FairminterSchedule {
  status?: string;
  start_block?: number | null;
}

/**
 * Whether a fairmint composed now could still be valid when it confirms.
 *
 * Core decides this at the *confirming* block, not at broadcast: `parse_block` runs
 * `fairminter.before_block` — which flips a fairminter to `open` once the height reaches its
 * `start_block` — before it parses that block's transactions. So a fairmint landing in the start
 * block itself is already valid.
 *
 * The timing runs the opposite way to intuition. A pre-broadcast mint is only safe when the sale
 * opens *very soon*, because the transaction has to be slow enough to land at or after the open;
 * one confirming earlier is written to `fairmints` as `invalid: fairminter is not open`, which
 * costs the miner fee and mints nothing. The earliest any broadcast can confirm is the next block,
 * so a sale opening on that block is the only pending case that cannot land early — which is why
 * the window is one block and not a tolerance.
 *
 * Without a height there is no window to measure, so a pending fairminter is left out rather than
 * guessed at.
 */
export function isFairminterMintableNow(
  fairminter: FairminterSchedule,
  currentHeight: number | null | undefined
): boolean {
  if (fairminter.status === "open") return true;
  if (fairminter.status !== "pending") return false;
  if (currentHeight === null || currentHeight === undefined) return false;
  const start = fairminter.start_block;
  if (start === null || start === undefined) return false;
  return start <= currentHeight + 1;
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
 * Which bound decided the answer. A count of zero is the same number whatever produced it, and
 * the four causes want four different sentences: "you have minted your allowance" and "the sale
 * is over" are not the same news, and telling someone their balance is too low when it is not is
 * worse than saying nothing.
 */
export type FairmintBound =
  | "balance"
  | "per_tx"
  | "hard_cap"
  | "per_address"
  /** Lot size or price is missing, so no count can be derived at all. */
  | "unavailable";

/**
 * How many lots can be minted in one transaction, given a balance to spend, and what limited it.
 *
 * Every bound core checks, in lots, so the Max button cannot offer a quantity core will reject:
 * what the balance affords, `max_mint_per_tx`, what is left under the hard cap, and what is left
 * of this address's allowance. The dispense form does the same with
 * `Math.min(affordableDispenses, remainingDispenses)`; this had only checked the first two.
 *
 * Bounds whose inputs are absent are skipped rather than guessed — an unknown supply is not a full
 * cap. Those cases still fail at compose, which is the safe direction.
 *
 * On a tie the earlier bound is kept, so `binding` names something that is genuinely true rather
 * than the last one evaluated: an address that is both broke and maxed out is told about the
 * balance, and both statements hold.
 */
export function getFairmintLots({
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
}): { lots: string; binding: FairmintBound } {
  const lotSize = fairminter.quantity_by_price_normalized;
  const lotCost = getFairminterLotCost(fairminter);
  if (!lotSize || !isGreaterThan(lotSize, 0) || !isGreaterThan(lotCost, 0)) {
    return { lots: "0", binding: "unavailable" };
  }

  let lots = roundDown(divide(balance, lotCost));
  let binding: FairmintBound = "balance";

  const capBy = (quantity: string | number | null | undefined, cause: FairmintBound) => {
    if (quantity === undefined || quantity === null || quantity === "") return;
    const allowed = roundDown(divide(quantity, lotSize));
    if (allowed.isLessThan(lots)) {
      lots = allowed;
      binding = cause;
    }
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

  capBy(perTx, "per_tx");

  if (hardCap && isGreaterThan(hardCap, 0)) {
    if (assetSupply !== undefined && assetSupply !== null) {
      capBy(subtract(hardCap, assetSupply).toString(), "hard_cap");
    }
  }
  if (perAddress && isGreaterThan(perAddress, 0)) {
    capBy(subtract(perAddress, alreadyMinted ?? 0).toString(), "per_address");
  }

  return { lots: maximum(lots, 0).toString(), binding };
}

/** Why there is nothing to mint, for the form to say instead of doing nothing. */
export function describeFairmintBound(binding: FairmintBound): string {
  switch (binding) {
    case "per_address":
      return "You have already minted the most this fairminter allows per address.";
    case "hard_cap":
      return "This sale has minted out — there is nothing left.";
    case "per_tx":
      return "This fairminter's per-transaction limit is smaller than one lot.";
    case "balance":
      return "Your XCP balance is too low to mint a lot.";
    case "unavailable":
      return "This fairminter does not price a lot, so there is nothing to mint.";
  }
}

/** @see getFairmintLots — the count alone, for callers with nothing to explain. */
export function getMaxFairmintLots(args: Parameters<typeof getFairmintLots>[0]): string {
  return getFairmintLots(args).lots;
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
