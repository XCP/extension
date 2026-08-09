import { ReviewScreen } from "@/components/screens/review-screen";
import { isGreaterThan } from "@/core/numeric";

/**
 * Props for the ReviewFairminter component.
 */
interface ReviewFairminterProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for fairminter creation transactions.
 * @param {ReviewFairminterProps} props - Component props
 * @returns {ReactElement} Review UI for fairminter transaction
 */
export function ReviewFairminter({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewFairminterProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Lot Price", value: result.params.lot_price },
    { label: "Lot Size", value: result.params.lot_size },
    ...(Number(result.params.max_mint_per_address ?? 0) > 0
      ? [{ label: "Mint per Address", value: result.params.max_mint_per_address }]
      : []),
    { label: "Hard Cap", value: result.params.hard_cap },
    // The three fields that make a pooled launch what it is were composed but never shown here,
    // so the pool terms were signed from a screen that did not mention them. The soft cap decides
    // whether anything is credited at all, and the window decides when.
    ...(isGreaterThan(result.params.pool_quantity ?? 0, 0)
      ? [
          { label: "Pool Reserve", value: String(result.params.pool_quantity) },
          ...(result.params.lp_asset
            ? [{ label: "LP Asset", value: String(result.params.lp_asset) }]
            : []),
        ]
      : []),
    ...(isGreaterThan(result.params.soft_cap ?? 0, 0)
      ? [{ label: "Soft Cap", value: String(result.params.soft_cap) }]
      : []),
    ...(Number(result.params.start_block ?? 0) > 0
      ? [
          {
            label: "Sale Window",
            value: `${result.params.start_block} → ${result.params.soft_cap_deadline_block ?? "—"}`,
          },
        ]
      : []),
    ...(result.params.description ? [{ label: "Description", value: result.params.description }] : []),
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
