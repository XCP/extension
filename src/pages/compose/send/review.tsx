import React, { type ReactElement } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewSend component.
 */
interface ReviewSendProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for sending transactions.
 * @param {ReviewSendProps} props - Component props
 * @returns {ReactElement} Review UI for send transaction
 */
export function ReviewSend({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewSendProps): ReactElement {
  const { result } = apiResponse;

  const formatQuantity = (quantity: number, isDivisible: boolean) =>
    isDivisible
      ? formatAmount({
          value: quantity / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      : quantity.toString();

  const customFields = [
    {
      label: "Amount",
      value: `${formatQuantity(Number(result.params.quantity), result.params.asset_info.divisible)} ${result.params.asset}`,
    },
    ...(result.params.memo ? [{ label: "Memo", value: result.params.memo }] : []),
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
