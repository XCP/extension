import { BigNumber, toBigNumber } from "@/utils/numeric";

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
