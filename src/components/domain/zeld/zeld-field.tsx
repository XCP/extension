import type { ReactElement } from "react";
import { formatAmount } from "@/core/format";
import { zeldBaseUnitsToDisplay } from "@/core/zeld/api";
import { HUNTS_WHILE_SIGNING } from "@/core/zeld/eligibility";
import type { ZeldHuntMetadata, ZeldProtectionMetadata, ZeldSendMetadata } from "@/core/zeld/types";
import { t } from '@/i18n';

function zeld(baseUnits: string): string {
  return formatAmount({ value: zeldBaseUnitsToDisplay(BigInt(baseUnits)), minimumFractionDigits: 0, maximumFractionDigits: 8 });
}

/**
 * One line, or nothing. Hunting runs in the background once it is on, so the review says only
 * what changed the outcome: a rare txid was found, or was not, or the guard kept ZELD out of a
 * payment. Change order, rolled-forward ZELD and skipped hunts are not worth a sentence.
 */
export function zeldReviewLine({
  hunt,
  protection,
  send,
}: {
  hunt?: ZeldHuntMetadata;
  protection?: ZeldProtectionMetadata;
  send?: ZeldSendMetadata;
}): string | null {
  if (send?.park) return t('zeld_review_park', [zeld(send.amount_base_units)]);
  if (send) return t('zeld_review_send', [zeld(send.amount_base_units), zeld(send.remainder_base_units)]);
  if (protection && protection.excluded.length > 0) {
    const count = protection.excluded.length;
    return count === 1 ? t('zeld_review_kept_one', [String(count)]) : t('zeld_review_kept_many', [String(count)]);
  }
  if (hunt?.status === 'found' && hunt.zero_count !== undefined) {
    return t('zeld_review_found', [String(hunt.zero_count), formatAmount({ value: hunt.elapsed_ms / 1000, minimumFractionDigits: 1, maximumFractionDigits: 1 })]);
  }
  if (hunt?.status === 'not_found') return t('zeld_review_not_found', [String(Math.min(hunt.seconds, Math.ceil(hunt.elapsed_ms / 1000)))]);
  if (hunt?.status === 'skipped' && hunt.reason === HUNTS_WHILE_SIGNING) return t('zeld_review_signing', [String(hunt.seconds)]);
  return null;
}

export function ZeldField(props: {
  hunt?: ZeldHuntMetadata;
  protection?: ZeldProtectionMetadata;
  send?: ZeldSendMetadata;
}): ReactElement | null {
  const line = zeldReviewLine(props);
  if (!line) return null;
  return (
    <div className="space-y-1">
      <span className="block font-semibold text-gray-700">ZELD:</span>
      <div className="bg-gray-50 p-2 rounded text-gray-900">{line}</div>
    </div>
  );
}
