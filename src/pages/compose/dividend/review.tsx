import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

interface ReviewDividendProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export const ReviewDividend = ({ apiResponse, onSign, onBack }: ReviewDividendProps) => {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    {
      label: "Dividend",
      value: `${result.params.quantity_per_unit} ${result.params.dividend_asset}`,
    },
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
