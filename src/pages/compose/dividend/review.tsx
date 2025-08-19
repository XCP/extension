import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewDividend component.
 */
interface ReviewDividendProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for dividend transactions.
 * @param {ReviewDividendProps} props - Component props
 * @returns {ReactElement} Review UI for dividend transaction
 */
export function ReviewDividend({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewDividendProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    {
      label: "Dividend",
      value: `${result.params.quantity_per_unit_normalized} ${result.params.dividend_asset}`,
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
