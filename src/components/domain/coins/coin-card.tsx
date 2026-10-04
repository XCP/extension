import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { PendingStatus } from "@/components/domain/balance/pending-status";
import { coinLockKindLabel, formatCoinBtc, formatOutpoint } from "@/components/domain/coins/coin-lock-text";
import { FaLock, FaLockOpen } from "@/components/icons";
import { backsOffers } from "@/core/bitcoin/coinLocks";
import { formatExpiry } from "@/core/counterparty/marketplace/format";
import { t } from '@/i18n';
import type { CoinLock } from '@/types/coinLocks';


const EXPLORER_TX_URL = 'https://mempool.space/tx/';

/** A small text button, sized as the order and dispenser cards size theirs. */
const SMALL_BUTTON = "inline-flex items-center gap-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const BLUE_BUTTON = `${SMALL_BUTTON} px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50`;
const GRAY_BUTTON = `${SMALL_BUTTON} px-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100`;

/** One of the address's coins, as the Coin Control page lists it. */
export interface CoinRow {
  outpoint: string;
  valueSats: number;
  /** Confirmations, 0 while in the mempool, or null when the coin is not on chain yet. */
  confirmations: number | null;
  /** A local lock can be shown before its chain status is known. Missing is not proof of a spend. */
  chainStatus?: 'checking' | 'unavailable' | 'missing';
  /** The coin carries Counterparty assets, which no send spends. */
  holdsAssets: boolean | null;
  lock?: CoinLock;
}

interface CoinCardProps {
  coin: CoinRow;
  onLock: () => void;
  onUnlock: () => void;
  onRelock: () => void;
  /** The card asks whether to unlock its offer coin: Unlock reads Confirm, with Cancel beside it. */
  confirming?: boolean;
  onCancelUnlock?: () => void;
  onConfirmUnlock?: () => void;
  busy?: boolean;
}

function Badge({ children, icon }: { children: string; icon?: ReactNode }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700">
      {icon}
      {children}
    </span>
  );
}

function hostnameOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

/** What unlocking an offer coin leaves standing, and what spending it would end. */
function unlockConfirmText(lock: CoinLock): string {
  return lock.refs.length === 0
    ? t('coins_unlock_confirm_funding')
    : lock.refs.length === 1
      ? t('coins_unlock_confirm_one_offer')
      : t('coins_unlock_confirm_offers', String(lock.refs.length));
}

/**
 * A coin with why it is locked and what the lock is for, and the one action it allows: lock a
 * free coin, unlock a locked one, or lock an unlocked offer coin again while its offer lives. A
 * coin holding assets has no action; sends never spend it anyway.
 *
 * Unlocking an offer coin asks first, in place: the same button becomes Confirm, with Cancel
 * beside it and a line saying its offers stay live but a send may now spend the coin and end them.
 * The page unlocks a coin locked by hand at once; Lock puts it back.
 */
export function CoinCard({
  coin, onLock, onUnlock, onRelock, confirming = false, onCancelUnlock, onConfirmUnlock, busy = false,
}: CoinCardProps): ReactElement {
  const { lock } = coin;
  const locked = lock !== undefined && !lock.unlocked;
  const offer = lock !== undefined && backsOffers(lock);
  const actionRef = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);

  // Cancel goes away with the question, so the focus it held returns to the action beside it.
  useEffect(() => {
    if (!confirming && cancelled.current) actionRef.current?.focus();
    cancelled.current = false;
  }, [confirming]);

  const cancelUnlock = () => {
    cancelled.current = true;
    onCancelUnlock?.();
  };

  const status = coin.chainStatus === 'checking'
    ? <span>{t('coins_checking_status')}</span>
    : coin.chainStatus === 'unavailable'
      ? <span>{t('coins_status_unavailable')}</span>
      : coin.chainStatus === 'missing'
        ? <span>{t('coins_not_found')}</span>
        : coin.confirmations === null
    ? <PendingStatus label={t('coins_not_on_chain_yet')} />
    : coin.confirmations === 0
      ? <PendingStatus label="Pending" />
      : <span>{coin.confirmations === 1 ? t('coins_confirmation_one') : t('coins_confirmations', String(coin.confirmations))}</span>;

  const action = coin.holdsAssets !== false && !lock
    ? null
    : locked
      ? {
        label: t('coins_unlock'), onClick: confirming ? onConfirmUnlock : onUnlock,
        icon: <FaLockOpen className="size-3" aria-hidden="true" />,
        // Only an offer coin asks, and its button keeps one width whichever it says.
        confirmLabel: offer ? t('coins_confirm_unlock') : undefined,
      }
      // A cancelled offer has nothing to lock again for; Lock protects the coin by hand instead.
      : lock?.unlocked && offer && !lock.cancelled
        ? { label: t('coins_lock_again'), onClick: onRelock, icon: <FaLock className="size-3" aria-hidden="true" /> }
        : { label: t('coins_lock'), onClick: onLock, icon: <FaLock className="size-3" aria-hidden="true" /> };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (confirming && event.key === "Escape") {
      event.stopPropagation();
      cancelUnlock();
    }
  };

  return (
    <article
      className="bg-white rounded-lg shadow-sm p-4"
      aria-label={t('coins_coin_label', [formatCoinBtc(coin.valueSats), formatOutpoint(coin.outpoint)])}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm text-gray-900 tabular-nums whitespace-nowrap">
            {t('coins_btc_amount', formatCoinBtc(coin.valueSats))}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-gray-500">
            <a
              href={`${EXPLORER_TX_URL}${coin.outpoint.slice(0, coin.outpoint.lastIndexOf(':'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-600 hover:underline"
              title={coin.outpoint}
            >
              {formatOutpoint(coin.outpoint)}
            </a>
            {status}
          </div>
        </div>
        {action && (
          <div className="flex-shrink-0 -mr-2 -mt-1 flex items-center gap-1">
            {confirming && (
              <button type="button" onClick={cancelUnlock} disabled={busy} className={GRAY_BUTTON}>
                {t('common_cancel')}
              </button>
            )}
            <button
              type="button"
              ref={actionRef}
              onClick={action.onClick}
              disabled={busy}
              aria-label={action.confirmLabel && (confirming ? action.confirmLabel : action.label)}
              className={BLUE_BUTTON}
            >
              {action.confirmLabel ? (
                // Both labels hold the one grid cell, so the button is as wide as the longer one
                // and its right edge, where the tap lands, never moves.
                <span className="grid justify-items-end" aria-hidden="true">
                  <span className={`[grid-area:1/1] inline-flex items-center gap-1 ${confirming ? "invisible" : ""}`}>
                    {action.icon}
                    {action.label}
                  </span>
                  <span className={`[grid-area:1/1] ${confirming ? "" : "invisible"}`}>{action.confirmLabel}</span>
                </span>
              ) : (
                <>
                  {action.icon}
                  {action.label}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {(lock || coin.holdsAssets !== false) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {coin.holdsAssets === null && <Badge>{t('coins_assets_unknown')}</Badge>}
          {coin.holdsAssets === true && <Badge>{t('coins_holds_assets')}</Badge>}
          {lock && offer && (
            <Badge icon={locked ? <FaLock className="size-2.5" aria-hidden="true" /> : undefined}>{coinLockKindLabel(lock.kind)}</Badge>
          )}
          {lock?.manual && <Badge icon={<FaLock className="size-2.5" aria-hidden="true" />}>{coinLockKindLabel('manual')}</Badge>}
          {lock?.unlocked && <Badge icon={<FaLockOpen className="size-2.5" aria-hidden="true" />}>{t('coins_unlocked')}</Badge>}
        </div>
      )}

      {lock && offer && (
        <p className="mt-2 text-xs text-gray-500">
          {[
            // Kept after a cancellation released it: what was signed against it works until it is spent.
            lock.cancelled
              ? t('coins_offer_cancelled')
              : lock.refs.length === 0
              ? t('coins_funds_offers')
              : lock.refs.length === 1 ? t('coins_backs_one_offer') : t('coins_backs_offers', String(lock.refs.length)),
            ...(lock.origin ? [t('coins_offer_site', hostnameOf(lock.origin))] : []),
            ...(lock.expiresAt ? [t('coins_offer_expires', formatExpiry(lock.expiresAt))] : []),
          ].join(" · ")}
        </p>
      )}

      {confirming && lock && <p className="mt-2 text-xs text-gray-700">{unlockConfirmText(lock)}</p>}
    </article>
  );
}
