import { ReviewScreen } from "@/components/screens/review-screen";

const yesNo = (value: boolean): string => (value ? "Yes" : "No");

interface ReviewIssuanceResetSupplyProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Review for a reset issuance.
 *
 * A reset replaces the asset rather than adjusting it, so the fields are shown as before/after
 * pairs: what is destroyed, and what exists once the transaction confirms. `asset_info` on the
 * verbose compose response describes the asset as it stands now; `params` carries what the message
 * will write.
 */
export function ReviewIssuanceResetSupply({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewIssuanceResetSupplyProps) {
  const { result } = apiResponse;
  const params = result.params;
  const assetInfo = params.asset_info;

  // Normalized on both sides — the raw `quantity` is base units and would read 1e8 off for a
  // divisible asset.
  const currentSupply = assetInfo?.supply_normalized ?? "0";
  const newSupply = params.quantity_normalized ?? params.quantity ?? "0";

  const wasDivisible = assetInfo?.divisible ?? false;
  const willBeDivisible = params.divisible ?? wasDivisible;

  // A reissuance that carries no description keeps the existing one, so an omitted description is
  // reported as unchanged rather than as empty.
  const newDescription =
    typeof params.description === "string" && params.description.length > 0
      ? params.description
      : (assetInfo?.description ?? "");

  const customFields = [
    { label: "Asset", value: params.asset },
    { label: "Supply Destroyed", value: currentSupply },
    { label: "New Supply", value: String(newSupply) },
  ];

  // Divisibility is always shown, as an arrow only when the reset is changing it — a reset is the
  // one issuance that can, so a silent flip would be the easiest thing here to miss.
  customFields.push({
    label: "Divisible",
    value:
      willBeDivisible === wasDivisible
        ? yesNo(willBeDivisible)
        : `${yesNo(wasDivisible)} → ${yesNo(willBeDivisible)}`,
  });

  if (newDescription !== (assetInfo?.description ?? "")) {
    customFields.push({ label: "New Description", value: newDescription });
  }

  if (params.lock === true) {
    customFields.push({ label: "Lock Supply", value: "Yes — permanent" });
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
