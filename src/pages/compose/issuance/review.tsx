import { FaLock, FaLockOpen } from "react-icons/fa";
import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";
import { toBigNumber } from "@/utils/numeric";

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
    
    if (isDiv) {
      // For divisible assets, divide by 100000000 and format with 8 decimal places
      const value = numValue.dividedBy(100000000);
      return formatAmount({ 
        value: value.toNumber(),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8 
      });
    }
    
    // For non-divisible assets, just return the number as is
    return numValue.toString();
  };

  const isDivisible = result.params.divisible;
  const isLocked = isTruthy(result.params.lock);

  const customFields = [
    { label: "Asset", value: result.params.asset },
    {
      label: "Issuance",
      value: formatQuantity(result.params.quantity, isDivisible),
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
      setError={setError}
    />
  );
};
