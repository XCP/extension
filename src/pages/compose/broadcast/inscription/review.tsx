import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewBroadcastInscription component.
 */
interface ReviewBroadcastInscriptionProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Displays a review screen for broadcast inscription transactions.
 */
export function ReviewBroadcastInscription({ apiResponse, onSign, onBack, error, isSigning }: ReviewBroadcastInscriptionProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Message", value: result.params.text },
    { 
      label: "MIME Type", 
      value: result.params.mime_type || "text/plain" 
    },
    { 
      label: "Inscription Size", 
      value: result.params.inscription ? `${(result.params.inscription.length * 0.75 / 1024).toFixed(2)} KB` : "N/A"
    },
    { 
      label: "Encoding", 
      value: "Taproot" 
    },
    { 
      label: "Value", 
      value: result.params.value !== undefined ? result.params.value : "0" 
    },
    { 
      label: "Fee Fraction", 
      value: result.params.fee_fraction !== undefined ? result.params.fee_fraction : "0" 
    },
    { 
      label: "Timestamp", 
      value: result.params.timestamp ? new Date(result.params.timestamp * 1000).toLocaleString() : "N/A" 
    },
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