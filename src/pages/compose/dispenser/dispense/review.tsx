import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewDispense component.
 */
interface ReviewDispenseProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
  formData?: any;
}

/**
 * Displays a review screen for dispense transactions.
 * @param {ReviewDispenseProps} props - Component props
 * @returns {ReactElement} Review UI for dispense transaction
 */
export function ReviewDispense({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning,
  formData 
}: ReviewDispenseProps) {
  const { result } = apiResponse;
  const extra = formData?.extra || {};
  const { totalAssets = [], totalBtcAmount = 0 } = extra;

  const customFields = [
    { label: "Dispenser Address", value: result.params.dispenser },
    {
      label: "Assets You Get",
      value: totalAssets
        .map((asset: any) =>
          `${formatAmount({
            value: Number(asset.quantity),
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          })} ${asset.asset_info?.asset_longname ?? asset.asset}`
        )
        .join(", "),
    },
    {
      label: "Total BTC Amount",
      value: `${(Number(result.params.quantity) / 1e8).toFixed(8)} BTC`,
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
