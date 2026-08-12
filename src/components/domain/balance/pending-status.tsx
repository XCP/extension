import type { ReactElement } from "react";

interface PendingStatusProps {
  /** A word from `core/balances/pendingLabel`, e.g. "Sending". */
  label: string;
  className?: string;
}

/**
 * "Sending", "Attaching", "Minting" — what the mempool is doing to this row.
 *
 * Italic and quiet on purpose. It is a note about the row, not a second figure competing with the
 * balance; a status that reads as loudly as the amount makes every card look like a warning. It is
 * announced politely rather than assertively for the same reason — a row changing to "Sending" is
 * worth hearing about after whatever you were reading, not over the top of it.
 */
export function PendingStatus({ label, className = "" }: PendingStatusProps): ReactElement {
  return (
    <span
      className={`text-xs italic text-gray-400 ${className}`}
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
