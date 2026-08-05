import type { PoolPosition } from "@/core/counterparty/api";
import { BigNumber, fromSatoshis, toBigNumber } from "@/core/numeric";

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
    quantity_normalized: divisible ? fromSatoshis(position.quantity) : String(position.quantity),
  };
}

export function getCanonicalPoolAssets(assetA: string, assetB: string): [string, string] {
  return assetA <= assetB ? [assetA, assetB] : [assetB, assetA];
}

export function getCanonicalPoolPair(assetA: string, assetB: string): string {
  return getCanonicalPoolAssets(assetA, assetB).join(" / ");
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
