import { ReviewScreen } from "@/components/screens/review-screen";
import { getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import { fromSatoshis } from "@/utils/numeric";

interface ReviewPoolDepositProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewPoolDeposit({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewPoolDepositProps) {
  const { result } = apiResponse;
  const params = result.params;
  const minimumLpDisplay = params.min_lp_quantity_normalized
    ?? fromSatoshis(params.min_lp_quantity ?? 0, { removeTrailingZeros: true });

  const customFields = [
    {
      label: "Pool",
      value: getCanonicalPoolPair(params.asset_a, params.asset_b),
    },
    {
      label: "Deposit",
      value: `${params.quantity_a_normalized ?? params.quantity_a} ${params.asset_a}\n${params.quantity_b_normalized ?? params.quantity_b} ${params.asset_b}`,
    },
    ...(params.min_lp_quantity && params.min_lp_quantity !== "0"
      ? [{ label: "Minimum LP", value: minimumLpDisplay }]
      : []),
    ...(params.lp_asset ? [{ label: "LP Asset", value: params.lp_asset }] : []),
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
