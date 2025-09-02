import { FaLock, FaLockOpen } from "react-icons/fa";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";

/**
 * Props for the ReviewIssuance component.
 */
interface ReviewIssuanceProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for asset issuance transactions.
 * @param {ReviewIssuanceProps} props - Component props
 * @returns {ReactElement} Review UI for issuance transaction
 */
export function ReviewIssuance({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewIssuanceProps) {
  const { result } = apiResponse;

  const isTruthy = (value: any): boolean => {
    if (value === "false") return false;
    return ["true", "1", 1, true].includes(value);
  };


  const isDivisible = result.params.divisible;
  const isLocked = isTruthy(result.params.lock);

  const customFields = [
    { label: "Asset", value: result.params.asset },
    {
      label: "Issuance",
      value: formatAssetQuantity(result.params.quantity, isTruthy(isDivisible)),
      rightElement: isLocked ? (
        <FaLock className="h-3 w-3 text-gray-500" aria-label="Supply locked" />
      ) : (
        <FaLockOpen className="h-3 w-3 text-gray-500" aria-label="Supply unlocked" />
      ),
    },
    ...(result.params.description ? [{ label: "Description", value: result.params.description }] : []),
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
