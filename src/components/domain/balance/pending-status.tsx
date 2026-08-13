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
 * balance; a status that reads as loudly as the amount makes every card look like a warning.
 *
 * Deliberately not a live region. Every row can carry one of these, and a single refresh updates
 * them all at once — a list of role="status" elements announces each change over the last, which
 * is noise, not information. The text is in the accessibility tree and reads with the row; a
 * screen-reader user encounters it exactly where a sighted user does.
 */
export function PendingStatus({ label, className = "" }: PendingStatusProps): ReactElement {
  return (
    // text-right: the flex row places this at the right edge, but the span's own box can be
    // wider than its text (the menu-clearance margin, or a wrapped two-word label), and then the
    // text sat left inside a right-positioned box.
    <span className={`text-xs italic text-gray-400 text-right ${className}`}>
      {label}
    </span>
  );
}
