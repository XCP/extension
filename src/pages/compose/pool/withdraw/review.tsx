import { ReviewScreen } from "@/components/screens/review-screen";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import { fromSatoshis } from "@/utils/numeric";

interface ReviewPoolWithdrawProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewPoolWithdraw({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewPoolWithdrawProps) {
  const { result } = apiResponse;
  const params = result.params;
  const { data: assetAInfo, isLoading: isLoadingAssetA } = useAssetInfo(params.asset_a || "");
  const { data: assetBInfo, isLoading: isLoadingAssetB } = useAssetInfo(params.asset_b || "");
  const formatMinimum = (
    normalized: string | undefined,
    raw: string | number | undefined,
    divisible: boolean | undefined,
    isLoadingAsset: boolean
  ) => {
    if (normalized !== undefined) return normalized;
    if (raw === undefined) return "0";
    if (divisible === undefined && isLoadingAsset) return "Loading...";
    return divisible ? fromSatoshis(raw, { removeTrailingZeros: true }) : raw.toString();
  };
  const minQuantityADisplay = formatMinimum(params.min_quantity_a_normalized, params.min_quantity_a, assetAInfo?.divisible, isLoadingAssetA);
  const minQuantityBDisplay = formatMinimum(params.min_quantity_b_normalized, params.min_quantity_b, assetBInfo?.divisible, isLoadingAssetB);
  const quantityDisplay = params.quantity_normalized
    ?? fromSatoshis(params.quantity ?? 0, { removeTrailingZeros: true });

  const customFields = [
    {
      label: "Pool",
      value: params.asset_a && params.asset_b ? getCanonicalPoolPair(params.asset_a, params.asset_b) : params.lp_asset,
    },
    {
      label: "Withdraw",
      value: `${quantityDisplay} ${params.lp_asset ?? "LP"}`,
    },
    ...(params.min_quantity_a || params.min_quantity_b
      ? [{
          label: "Minimum Receive",
          value: `${minQuantityADisplay} ${params.asset_a ?? ""}\n${minQuantityBDisplay} ${params.asset_b ?? ""}`,
        }]
      : []),
  ];

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      isSigning={isSigning}
    />
  );
}
