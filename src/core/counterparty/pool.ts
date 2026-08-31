import type { PoolPosition } from "@/core/counterparty/api";
import {
  asDisplayUnits,
  BigNumber,
  divide,
  fromSatoshis,
  isFiniteNumber,
  maximum,
  minimum,
  multiply,
  roundUp,
  toBigNumber,
} from '@/core/numeric';
import { DEFAULT_POOL_SLIPPAGE, POOL_SLIPPAGE_AUTO } from "@/core/settings";
import { getTradingPair } from "@/core/tradingPair";

/**
 * verbose=true does not normalize the LP `quantity` on the address pools
 * endpoint: core's get_pool_positions_by_address selects no `asset` column, so
 * verbose.py never resolves the asset_info it needs to inject
 * quantity_normalized (reserves do normalize, via asset_a/asset_b). Derive it
 * from lp_asset_info.divisible — always true today, per core's own comment in
 * verbose.py — so raw satoshis never reach the UI pretending to be normalized.
 */
export function normalizePoolPosition(position: PoolPosition): PoolPosition {
  if (position.quantity_normalized != null || position.quantity == null) {
    return position;
  }
  const lpAssetInfo = position.lp_asset_info as { divisible?: boolean } | undefined;
  const divisible = lpAssetInfo?.divisible ?? true;
  return {
    ...position,
    quantity_normalized: asDisplayUnits(divisible ? fromSatoshis(position.quantity) : String(position.quantity)),
  };
}

/**
 * The order a pool's two assets are shown in, as [base, quote].
 *
 * The protocol stores a pool's assets alphabetically, and displaying them that way makes prices
 * read backwards whenever the quote asset happens to sort second: BTC/PEPECASH implies a price
 * denominated in PEPECASH, and XCP/ZZZCOIN implies one denominated in ZZZCOIN. Pools therefore use
 * the same base/quote rule as DEX orders and the market pages, so one pair reads the same way
 * everywhere in the app.
 *
 * Display only. Nothing here decides what is sent to core — compose calls and the pool endpoints
 * take `pool.asset_a`/`pool.asset_b` as the API returned them.
 */
export function getPoolDisplayAssets(assetA: string, assetB: string): [string, string] {
  return getTradingPair(assetA, assetB);
}

export function getPoolDisplayPair(assetA: string, assetB: string): string {
  return getPoolDisplayAssets(assetA, assetB).join(" / ");
}

/** Below the pool fee a swap mostly just fails; above 5% the tolerance stops protecting anything. */
const MIN_AUTO_SLIPPAGE = "0.5";
const MAX_AUTO_SLIPPAGE = "5";

/**
 * Slippage tolerance Auto picks for a swap, as a percent string.
 *
 * A trade's own price impact is what another taker of the same size would move the price by, so
 * Auto tolerates roughly that and no more: rounded up to a tenth, floored at 0.5% (pool-fee
 * territory, below which a swap mostly just fails) and capped at 5%. With no quote yet there is
 * nothing to derive it from, so it falls back to the standing default.
 */
export function getAutoSlippage(priceImpact: number | null | undefined): string {
  // price_impact arrives as a raw JSON number, so NaN and the infinities are all reachable.
  if (typeof priceImpact !== "number" || !isFiniteNumber(priceImpact)) {
    return DEFAULT_POOL_SLIPPAGE;
  }
  // Rounded through BigNumber rather than Math.ceil: the impact arrives as a float, and an impact
  // of exactly 2 can reach here as 2.0000000000000004, which raw arithmetic rounds up to 2.1.
  const toTenth = divide(roundUp(multiply(priceImpact, 10)), 10);
  return minimum(MAX_AUTO_SLIPPAGE, maximum(MIN_AUTO_SLIPPAGE, toTenth)).toString();
}

/**
 * The slippage percent to actually use, from the stored setting.
 *
 * Auto is a value the one slippage setting can hold, not a second setting beside it, so every
 * screen resolves it the same way.
 *
 * Deposit and withdraw pass no impact and so land on the numeric default. That is not because they
 * are safe from slippage — another deposit, withdrawal or trade confirming first moves the ratio
 * and changes what they return, which is exactly what their tolerance guards against. It is that
 * neither quotes a price impact, so there is no per-transaction figure for Auto to size against.
 */
export function resolvePoolSlippage(
  setting: string | undefined,
  priceImpact?: number | null
): string {
  if (!setting || setting === POOL_SLIPPAGE_AUTO) return getAutoSlippage(priceImpact);
  return setting;
}

export function isAutoPoolSlippage(setting: string | undefined): boolean {
  return !setting || setting === POOL_SLIPPAGE_AUTO;
}

export function applyPoolSlippage(value: number | string | null | undefined, slippagePercent: string): string {
  if (value === null || value === undefined) return "0";

  const bps = toBigNumber(slippagePercent || "0").times(100);
  const multiplier = BigNumber.maximum(0, toBigNumber(10000).minus(bps));
  const quoted = toBigNumber(value);
  const minimum = quoted
    .times(multiplier)
    .div(10000)
    .integerValue(BigNumber.ROUND_DOWN);

  // Core rejects a DEX order whose minimum receive quantity is zero. A percentage haircut on a
  // one-base-unit quote (most visibly one indivisible collectible) otherwise floors 1 to 0 even
  // though the quote is perfectly fillable. There is no fractional unit in which to express
  // slippage here, so the only valid minimum is the quoted unit itself. Keep 100%+ slippage at
  // zero for the generic helper's existing contract; signing forms never allow that range.
  if (quoted.isGreaterThan(0) && multiplier.isGreaterThan(0) && minimum.isZero()) return "1";

  return minimum.toString();
}

export function calculateInitialLpEstimate(quantityA: string, quantityB: string): string {
  const product = toBigNumber(quantityA).times(quantityB);
  if (!product.isGreaterThan(0)) return "0";
  return product.sqrt().integerValue(BigNumber.ROUND_DOWN).toString();
}

export function calculateLimitingLpEstimate(
  mintedEstimate: number | string | null | undefined,
  partnerRequired: number | string | null | undefined,
  partnerProvided: string
): string {
  if (mintedEstimate === null || mintedEstimate === undefined) return "0";
  if (partnerRequired === null || partnerRequired === undefined) return mintedEstimate.toString();

  const required = toBigNumber(partnerRequired);
  const provided = toBigNumber(partnerProvided);
  if (!required.isGreaterThan(0) || provided.isGreaterThanOrEqualTo(required)) {
    return mintedEstimate.toString();
  }

  return toBigNumber(mintedEstimate)
    .times(provided)
    .div(required)
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();
}

/**
 * Why a swap quote produced nothing, when it produced nothing.
 *
 * `estimated_output: 0` and `give_remaining: <the whole input>` is what the endpoint returns both
 * when the pair has no pool and when the pool is deep but the input is too small to buy a single
 * unit of the other asset. The screen read only the output, so it answered "No liquidity available
 * for this pair" for a pool that had just quoted the opposite direction at 1% impact — and then
 * advised trying a *smaller* amount, which is the one change guaranteed not to help.
 *
 * Live, for a PEPECASH/XCP pool holding both sides: 157 sats in returns 0 out with
 * `pool_exists: true`, 245 likewise, and 300 returns 1. Nothing is missing from the pool at 157;
 * 157 PEPECASH is worth 0.64 satoshis of XCP, and a quantity is an integer.
 */
export type SwapQuoteOutcome =
  /** Fills completely. */
  | "fillable"
  /** Fills partly: a book-only route runs out inside this trade. */
  | "partial"
  /** The pool can trade, but this input rounds down to zero of the other asset. */
  | "dust"
  /** No pool to trade against. */
  | "no_pool";

interface SwapQuoteFields {
  estimated_output?: number;
  pool_output?: string | number | null;
  give_remaining?: string | number | null;
  pool_exists?: boolean;
}

export function readSwapQuoteOutcome(quote: SwapQuoteFields | null | undefined): SwapQuoteOutcome {
  if (!quote) return "no_pool";

  const output = toBigNumber(quote.estimated_output ?? 0);
  // A 64-bit asset quantity, so it can arrive as a string: "10" > 0 compares as text.
  const remaining = toBigNumber(quote.give_remaining ?? 0);
  const poolOutput = toBigNumber(quote.pool_output ?? 0);

  if (output.isGreaterThan(0)) {
    // Core deliberately trims a pool fill to the least input that still buys the same floored
    // integer output. The small give_remaining is refunded rounding dust, not exhausted
    // liquidity. Only a book-only quote can genuinely run out part-way through an input.
    if (poolOutput.isGreaterThan(0)) return "fillable";
    return remaining.isGreaterThan(0) ? "partial" : "fillable";
  }
  // Only claim the amount is the problem when the pool is known to exist. An absent `pool_exists`
  // is not evidence of one, and "too small" would be a worse wrong answer than the generic one.
  return quote.pool_exists === true ? "dust" : "no_pool";
}

/** What to tell someone, or null when the quote is fine. */
export function describeSwapQuoteOutcome(
  outcome: SwapQuoteOutcome,
  assets: { giveAsset: string; getAsset: string }
): string | null {
  switch (outcome) {
    case "fillable":
      return null;
    case "partial":
      return "Not enough order-book liquidity to fill this amount right now. Try a smaller amount, or place a DEX order to rest on the book.";
    case "dust":
      return `This amount is too small to swap: it works out to less than the smallest unit of ${assets.getAsset}, so the pool would return nothing. Try a larger amount of ${assets.giveAsset}.`;
    case "no_pool":
      return "No liquidity available for this pair.";
  }
}
