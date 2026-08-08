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

  return toBigNumber(value)
    .times(multiplier)
    .div(10000)
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();
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
