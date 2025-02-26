import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewBroadcast component.
 */
interface ReviewBroadcastProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for broadcast transactions.
 * @param {ReviewBroadcastProps} props - Component props
 * @returns {ReactElement} Review UI for broadcast transaction
 */
export function ReviewBroadcast({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewBroadcastProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Message", value: result.params.text },
    ...(result.params.value !== "0" && result.params.value !== 0
      ? [{ label: "Value", value: result.params.value }]
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
