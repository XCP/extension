import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposerOptional } from "@/contexts/composer-context";

/**
 * Props for the ReviewBTCPay component.
 */
interface ReviewBTCPayProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for BTC payment transactions.
 * @param {ReviewBTCPayProps} props - Component props
 * @returns {ReactElement} Review UI for BTC payment transaction
 */
export function ReviewBTCPay({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewBTCPayProps) {
  const { result } = apiResponse;
  // Which order match is being settled is the whole content of a BTCPay, and it is the one field
  // the transaction itself states. Reading it from the decoded message rather than from the
  // response's echo means a composer that settled a different match cannot display as the one
  // that was asked for (ADR-019). BTCPay has no local packer, so this echo was unverified.
  const decoded = useComposerOptional()?.state.decodedMessage?.data as
    | { orderMatchId?: string }
    | undefined;

  const customFields = [
    { label: "Order Match ID", value: decoded?.orderMatchId ?? result.params.order_match_id },
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
