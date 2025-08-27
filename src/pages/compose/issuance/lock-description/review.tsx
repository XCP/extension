import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewLockDescriptionProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewLockDescription({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewLockDescriptionProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { 
      label: "Action", 
      value: "Lock Description",
      className: "text-red-600 font-medium"
    },
    { 
      label: "Warning", 
      value: "This permanently prevents future description changes",
      className: "text-red-600 text-sm"
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