import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

interface ReviewIssuanceUpdateDescriptionProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export const ReviewIssuanceUpdateDescription = ({
  apiResponse,
  onSign,
  onBack,
}: ReviewIssuanceUpdateDescriptionProps) => {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Description", value: result.params.description },
  ];

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error || result.error} // Include result.error if present
      setError={setError}
    />
  );
};
