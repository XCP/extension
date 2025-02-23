import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";

interface ReviewIssuanceResetSupplyProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export const ReviewIssuanceResetSupply = ({
  apiResponse,
  onSign,
  onBack,
}: ReviewIssuanceResetSupplyProps) => {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const isDivisible = result.params.asset_info.divisible;

  const formatAssetAmount = (value: string | number): string => {
    const numericValue = isDivisible ? Number(value) / 1e8 : Number(value);
    return formatAmount({
      value: numericValue,
      minimumFractionDigits: isDivisible ? 8 : 0,
      maximumFractionDigits: isDivisible ? 8 : 0,
      useGrouping: true,
    });
  };

  const currentSupply = result.params.asset_info.supply
    ? formatAssetAmount(result.params.asset_info.supply)
    : "0";

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Current Supply", value: currentSupply },
    { label: "Action", value: "Reset Supply" },
  ];

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      setError={setError}
    />
  );
};
