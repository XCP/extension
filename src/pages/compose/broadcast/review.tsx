import { ReviewScreen } from "@/components/screens/review-screen";
import { useSettings } from "@/contexts/settings-context";

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
  const { settings } = useSettings();
  const showAdvancedOptions = settings?.enableAdvancedBroadcasts ?? false;
  
  // Base fields always shown
  const customFields = [
    { label: "Message", value: result.params.text },
  ];
  
  // Add value and fee_fraction fields if advanced options are enabled
  if (showAdvancedOptions) {
    customFields.push({ label: "Value", value: result.params.value });
    customFields.push({ label: "Fee Fraction", value: result.params.fee_fraction });
  }

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
