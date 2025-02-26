import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewSweep component.
 */
interface ReviewSweepProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for sweep transactions.
 * @param {ReviewSweepProps} props - Component props
 * @returns {ReactElement} Review UI for sweep transaction
 */
export function ReviewSweep({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewSweepProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Destination", value: result.params.destination },
    ...(result.params.memo ? [{ label: "Memo", value: result.params.memo }] : []),
    ...(result.params.flag !== undefined
      ? [{ label: "Flag", value: result.params.flag.toString() }]
      : []),
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
