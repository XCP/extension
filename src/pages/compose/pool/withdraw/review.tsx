import { useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useSettings } from "@/contexts/settings-context";
import { getPoolWithdrawEstimateXcpFee } from "@/utils/blockchain/counterparty/compose";
import { formatAmount } from "@/utils/format";
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
  const { settings } = useSettings();
  const { xcp: xcpPrice } = useMarketPrices(settings.fiat);
  const [xcpFeeEstimate, setXcpFeeEstimate] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);

  useEffect(() => {
    const fetchFeeEstimate = async () => {
      try {
        const sourceAddress = params.source;
        if (sourceAddress) {
          const fee = await getPoolWithdrawEstimateXcpFee(sourceAddress);
          setXcpFeeEstimate(fee);
        }
      } catch (err) {
        console.error("Failed to fetch pool withdraw XCP fee estimate:", err);
      } finally {
        setFeeLoading(false);
      }
    };

    fetchFeeEstimate();
  }, [params.source]);

  const xcpFeeInXcp = xcpFeeEstimate !== null ? fromSatoshis(xcpFeeEstimate, true) : null;
  const xcpFeeInFiat = xcpFeeInXcp !== null && xcpPrice ? xcpFeeInXcp * xcpPrice : null;

  const customFields = [
    {
      label: "Pool",
      value: params.asset_a && params.asset_b ? `${params.asset_a} / ${params.asset_b}` : params.lp_asset,
    },
    {
      label: "Withdraw",
      value: `${params.quantity_normalized ?? params.quantity} ${params.lp_asset ?? "LP"}`,
    },
    ...(params.min_quantity_a || params.min_quantity_b
      ? [{
          label: "Minimum Receive",
          value: `${params.min_quantity_a_normalized ?? params.min_quantity_a ?? "0"} ${params.asset_a ?? ""}\n${params.min_quantity_b_normalized ?? params.min_quantity_b ?? "0"} ${params.asset_b ?? ""}`,
        }]
      : []),
    {
      label: "XCP Fee",
      value: feeLoading
        ? "Loading..."
        : xcpFeeEstimate !== null
          ? `${formatAmount({
              value: xcpFeeInXcp!,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })} XCP`
          : "Unable to estimate",
      rightElement: !feeLoading && xcpFeeInFiat !== null
        ? <span className="text-gray-500">${formatAmount({ value: xcpFeeInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        : undefined,
    },
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
