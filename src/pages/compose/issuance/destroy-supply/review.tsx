import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";

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
  const assetDivisible = result.params.asset_info?.divisible ?? true;


  const customFields = [
    {
      label: "Amount",
      value: `${formatAssetQuantity(Number(result.params.quantity), assetDivisible)} ${asset}`,
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
