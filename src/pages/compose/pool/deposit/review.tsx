import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposerOptional } from "@/contexts/composer-context-object";
import { getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import { fromSatoshis } from "@/utils/numeric";

interface ReviewPoolDepositProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewPoolDeposit({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewPoolDepositProps) {
  const { result } = apiResponse;
  const params = result.params;
  // Pool deposits have no local packer, so these params were an unverified echo. Which pool is
  // being deposited into is stated by the transaction, so the pair is read from the decoded
  // message (ADR-019). Quantities keep the response's normalized strings, since converting the
  // decoded base units needs each asset's divisibility — a ledger fact, not a property of this
  // transaction.
  const decoded = useComposerOptional()?.state.decodedMessage?.data as
    | { assetA?: string; assetB?: string; lpAsset?: string }
    | undefined;
  const assetA = decoded?.assetA ?? params.asset_a;
  const assetB = decoded?.assetB ?? params.asset_b;
  const minimumLpDisplay = params.min_lp_quantity_normalized
    ?? fromSatoshis(params.min_lp_quantity ?? 0, { removeTrailingZeros: true });

  const customFields = [
    {
      label: "Pool",
      value: getCanonicalPoolPair(assetA, assetB),
    },
    {
      label: "Deposit",
      value: `${params.quantity_a_normalized ?? params.quantity_a} ${params.asset_a}\n${params.quantity_b_normalized ?? params.quantity_b} ${params.asset_b}`,
    },
    ...(params.min_lp_quantity && params.min_lp_quantity !== "0"
      ? [{ label: "Minimum LP", value: minimumLpDisplay }]
      : []),
    ...((decoded?.lpAsset ?? params.lp_asset)
      ? [{ label: "LP Asset", value: decoded?.lpAsset ?? params.lp_asset }]
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
