import { FaLock, FaLockOpen } from "react-icons/fa";
import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";
import { toBigNumber, fromSatoshis } from "@/utils/numeric";

interface ReviewIssuanceProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export const ReviewIssuance = ({ apiResponse, onSign, onBack }: ReviewIssuanceProps) => {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const isTruthy = (value: any): boolean => {
    if (value === "false") return false;
    return ["true", "1", 1, true].includes(value);
  };

  const formatQuantity = (quantity: string, isDivisible: any): string => {
    const isDiv = isTruthy(isDivisible);
    const numValue = toBigNumber(quantity);
    return isDiv ? formatAmount({ 
      value: fromSatoshis(numValue).toNumber(),
      minimumFractionDigits: 8, 
      maximumFractionDigits: 8 
    }) : numValue.toString();
  };

  const isDivisible = result.params.divisible;
  const isLocked = isTruthy(result.params.lock);

  const customFields = [
    { label: "Asset", value: result.params.asset },
    {
      label: "Issue",
      value: (
        <div className="flex items-center justify-between">
          <span>{formatQuantity(result.params.quantity, isDivisible)}</span>
          {isLocked ? (
            <FaLock className="h-3 w-3 text-gray-500" aria-label="Supply locked" />
          ) : (
            <FaLockOpen className="h-3 w-3 text-gray-500" aria-label="Supply unlocked" />
          )}
        </div>
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
      setError={setError}
    />
  );
};
