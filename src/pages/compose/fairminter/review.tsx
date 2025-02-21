import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

interface ReviewFairminterProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export const ReviewFairminter = ({ apiResponse, onSign, onBack }: ReviewFairminterProps) => {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Price", value: result.params.price },
    { label: "Quantity by Price", value: result.params.quantity_by_price },
    { label: "Hard Cap", value: result.params.hard_cap },
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
