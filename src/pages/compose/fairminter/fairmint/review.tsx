import { useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { type FairminterDetails, fetchAssetFairminter } from "@/core/counterparty/api";
import {
  describeFairminterPaymentModel,
  getFairmintCost,
  isPaidFairminter,
  readFairminterPaymentModel,
} from "@/core/counterparty/fairminterModel";
import { isGreaterThan } from "@/core/numeric";

import { t } from '@/i18n';

/**
 * Props for the ReviewFairmint component.
 */
interface ReviewFairmintProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Review screen for fairmint transactions.
 *
 * This showed the asset and the quantity and nothing else, so the one number the screen existed to
 * confirm — what leaves your wallet — never appeared on it. The compose response carries only the
 * asset and quantity, so the price is fetched here, the way the dispense review re-fetches its
 * dispenser rather than trusting the compose params.
 */
export function ReviewFairmint({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewFairmintProps) {
  const { result } = apiResponse;
  const asset = result.params.asset;

  // Use normalized quantity from verbose API response (handles divisibility correctly)
  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  const [fairminter, setFairminter] = useState<FairminterDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!asset) return;

    fetchAssetFairminter(asset)
      .then((found) => {
        if (!cancelled) setFairminter(found);
      })
      .catch((err) => {
        // A failed lookup must not block signing, but it must not invent a cost either: the cost
        // rows are simply absent rather than shown as zero.
        console.error("Failed to fetch fairminter for review:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [asset]);

  const customFields: Array<{ label: string; value: string }> = [
    { label: t('common_asset'), value: asset },
  ];

  if (fairminter) {
    const model = readFairminterPaymentModel(fairminter);
    const escrowed = isGreaterThan(fairminter.soft_cap_normalized ?? fairminter.soft_cap ?? 0, 0);

    if (isPaidFairminter(model)) {
      const cost = getFairmintCost(fairminter, quantityDisplay);
      customFields.push({
        // Core escrows the assets until the soft cap is met, so they do not arrive on confirmation.
        label: escrowed ? t('fairmint_review_you_receive_after_soft_cap') : t('common_you_receive'),
        value: `${quantityDisplay} ${asset}`,
      });
      // Absent when the lot size is unknown: see getFairmintCost.
      if (cost !== null) {
        customFields.push({ label: t('fairmint_review_you_pay'), value: `${cost} XCP` });
      }
    } else {
      // A free mint's quantity is set by the fairminter, so the composed quantity is 0 and
      // reporting it as what you receive would read as receiving nothing.
      customFields.push({ label: t('fairmint_review_you_pay'), value: t('common_bitcoin_network_fee_only') });
    }

    customFields.push({ label: t('common_payment'), value: describeFairminterPaymentModel(model) });

    if (model === "issuer" && fairminter.source) {
      customFields.push({ label: t('fairmint_review_paid_to'), value: fairminter.source });
    }
    if (escrowed) {
      customFields.push({
        label: t('fairmint_review_soft_cap'),
        value: t('fairmint_review_payment_and_tokens_are_held'),
      });
    }
  } else {
    // Pre-fetch, or after a failed lookup: say what was composed without claiming a price.
    customFields.push({ label: t('common_quantity'), value: quantityDisplay });
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
