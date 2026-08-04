import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposerOptional } from "@/contexts/composer-context";
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
  // Pool withdrawals have no local packer, so these params were an unverified echo. Which pool is
  // being withdrawn from is stated by the transaction, so the pair comes from the decoded message
  // (ADR-019). Quantities keep the response's normalized strings, since converting decoded base
  // units needs each asset's divisibility — a ledger fact rather than part of this transaction.
  const decoded = useComposerOptional()?.state.decodedMessage?.data as
    | { assetA?: string; assetB?: string }
    | undefined;
  const assetA = decoded?.assetA ?? params.asset_a;
  const assetB = decoded?.assetB ?? params.asset_b;
  const { data: assetAInfo, isLoading: isLoadingAssetA } = useAssetInfo(assetA || "");
  const { data: assetBInfo, isLoading: isLoadingAssetB } = useAssetInfo(assetB || "");
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
      value: assetA && assetB ? getCanonicalPoolPair(assetA, assetB) : params.lp_asset,
    },
    {
      label: "Withdraw",
      value: `${quantityDisplay} ${params.lp_asset ?? "LP"}`,
    },
    ...(params.min_quantity_a || params.min_quantity_b
      ? [{
          label: "Minimum Receive",
          value: `${minQuantityADisplay} ${assetA ?? ""}\n${minQuantityBDisplay} ${assetB ?? ""}`,
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
