import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewDestroyProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewDestroy({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewDestroyProps) {
  const { result } = apiResponse;
  const asset = result.params.asset;

  // Use normalized quantity from verbose API response (handles divisibility correctly)
  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  const customFields = [
    {
      label: "Amount",
      value: `${quantityDisplay} ${asset}`,
    },
    ...(result.params.tag ? [{ label: "Memo", value: result.params.tag }] : []),
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
