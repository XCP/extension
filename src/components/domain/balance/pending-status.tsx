import type { ReactElement } from "react";
import type { PendingLabel } from '@/core/balances/pendingLabel';
import { t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';

// Functions defer translation until render. Core's labels and memoized maps remain locale-free.
const PENDING_TEXT: Record<PendingLabel, () => string> = {
  Sending: () => t('balance_pending_sending'),
  Sweeping: () => t('balance_pending_sweeping'),
  Ordering: () => t('balance_pending_ordering'),
  Cancelling: () => t('cards_manage_order_card_cancelling'),
  Matching: () => t('balance_pending_matching'),
  Paying: () => t('balance_pending_paying'),
  Issuing: () => t('balance_pending_issuing'),
  Resetting: () => t('balance_pending_resetting'),
  Dispensing: () => t('balance_pending_dispensing'),
  Opening: () => t('balance_pending_opening'),
  Refilling: () => t('balance_pending_refilling'),
  Closing: () => t('dispenser_manage_dispenser_card_closing'),
  Attaching: () => t('balance_pending_attaching'),
  Detaching: () => t('balance_pending_detaching'),
  Moving: () => t('balance_pending_moving'),
  Depositing: () => t('balance_pending_depositing'),
  Withdrawing: () => t('balance_pending_withdrawing'),
  Minting: () => t('balance_pending_minting'),
  'Paying dividend': () => t('balance_pending_dividend'),
  Burning: () => t('balance_pending_burning'),
  Pending: () => t('balance_pending_confirmation'),
};

interface PendingStatusProps {
  /** A stable core pending label, or display text already supplied by the caller. */
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
  useLocaleRevision();
  const text = Object.hasOwn(PENDING_TEXT, label)
    ? PENDING_TEXT[label as PendingLabel]()
    : label;
  return (
    // text-right: the flex row places this at the right edge, but the span's own box can be
    // wider than its text (the menu-clearance margin, or a wrapped two-word label), and then the
    // text sat left inside a right-positioned box.
    <span className={`text-xs italic text-gray-400 text-right ${className}`}>
      {text}
    </span>
  );
}
