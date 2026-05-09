import { useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useSettings } from "@/contexts/settings-context";
import { getPoolDepositEstimateXcpFee } from "@/utils/blockchain/counterparty/compose";
import { getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import { formatAmount } from "@/utils/format";
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
  const { settings } = useSettings();
  const { xcp: xcpPrice } = useMarketPrices(settings.fiat);
  const [xcpFeeEstimate, setXcpFeeEstimate] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);

  useEffect(() => {
    const fetchFeeEstimate = async () => {
      try {
        const sourceAddress = params.source;
        if (sourceAddress) {
          const fee = await getPoolDepositEstimateXcpFee(sourceAddress);
          setXcpFeeEstimate(fee);
        }
      } catch (err) {
        console.error("Failed to fetch pool deposit XCP fee estimate:", err);
      } finally {
        setFeeLoading(false);
      }
    };

    fetchFeeEstimate();
  }, [params.source]);

  const xcpFeeInXcp = xcpFeeEstimate !== null ? fromSatoshis(xcpFeeEstimate, true) : null;
  const xcpFeeInFiat = xcpFeeInXcp !== null && xcpPrice ? xcpFeeInXcp * xcpPrice : null;
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
