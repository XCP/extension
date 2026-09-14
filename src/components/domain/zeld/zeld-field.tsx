import type { ReactElement } from "react";
import { formatAmount } from "@/core/format";
import { zeldBaseUnitsToDisplay } from "@/core/zeld/api";
import { HUNTS_WHILE_SIGNING } from "@/core/zeld/composeHunt";
import type { ZeldHuntMetadata, ZeldProtectionMetadata, ZeldSendMetadata } from "@/core/zeld/types";

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
  if (send?.park) return `Moving ${zeld(send.amount_base_units)} ZELD to a small output of your own`;
  if (send) return `Sending ${zeld(send.amount_base_units)} ZELD; ${zeld(send.remainder_base_units)} stays with you`;
  if (protection && protection.excluded.length > 0) {
    const count = protection.excluded.length;
    return `Kept ${count} output${count === 1 ? '' : 's'} holding ZELD out of this payment`;
  }
  if (hunt?.status === 'found' && hunt.zero_count !== undefined) {
    return `Rare txid found: ${hunt.zero_count} zeros in ${(hunt.elapsed_ms / 1000).toFixed(1)}s`;
  }
  if (hunt?.status === 'not_found') return `No rare txid in ${hunt.seconds}s; sending as usual`;
  if (hunt?.status === 'skipped' && hunt.reason === HUNTS_WHILE_SIGNING) return `Hunts for ZELD while signing, up to ${hunt.seconds}s`;
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
