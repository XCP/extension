import type { ReactElement } from "react";
import { coinLockKindLabel, formatCoinBtc, formatOutpoint } from "@/components/domain/coins/coin-lock-text";
import { FaLock, FaLockOpen } from "@/components/icons";
import { backsOffers, type CoinLock } from "@/core/bitcoin/coinLocks";
import { formatExpiry } from "@/core/counterparty/marketplace/format";
import { t } from '@/i18n';

/** One of the address's coins, as the Coins settings page lists it. */
export interface CoinRow {
  outpoint: string;
  valueSats: number;
  /** Confirmations, 0 while in the mempool, or null when the coin is not on chain yet. */
  confirmations: number | null;
  /** The coin carries Counterparty assets, which no send spends. */
  holdsAssets: boolean;
  lock?: CoinLock;
}

interface CoinCardProps {
  coin: CoinRow;
  onLock: () => void;
  onUnlock: () => void;
  onRelock: () => void;
  busy?: boolean;
}

function Badge({ children, tone }: { children: string; tone: "locked" | "neutral" }): ReactElement {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${
      tone === "locked" ? "bg-warning-100 text-warning-800" : "bg-gray-100 text-gray-600"
    }`}>
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

/**
 * A coin with why it is locked and what the lock is for, and the one action it allows: lock a
 * free coin, unlock a locked one, or lock an unlocked offer coin again while its offer lives. A
 * coin holding assets has no action; sends never spend it anyway.
 */
export function CoinCard({ coin, onLock, onUnlock, onRelock, busy = false }: CoinCardProps): ReactElement {
  const { lock } = coin;
  const locked = lock !== undefined && !lock.unlocked;
  const offer = lock !== undefined && backsOffers(lock);
  const status = coin.confirmations === null
    ? t('coins_not_on_chain_yet')
    : coin.confirmations === 0
      ? t('coins_unconfirmed')
      : coin.confirmations === 1
        ? t('coins_confirmation_one')
        : t('coins_confirmations', String(coin.confirmations));

  const action = coin.holdsAssets && !lock
    ? null
    : locked
      ? { label: t('coins_unlock'), onClick: onUnlock, icon: <FaLockOpen className="size-3" aria-hidden="true" /> }
      : lock?.unlocked && offer
        ? { label: t('coins_lock_again'), onClick: onRelock, icon: <FaLock className="size-3" aria-hidden="true" /> }
        : { label: t('coins_lock'), onClick: onLock, icon: <FaLock className="size-3" aria-hidden="true" /> };

  return (
    <article
      className={`bg-white border rounded-lg p-4 ${locked ? "border-warning-200" : "border-gray-200"}`}
      aria-label={t('coins_coin_label', [formatCoinBtc(coin.valueSats), formatOutpoint(coin.outpoint)])}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm text-gray-900 tabular-nums">
            {t('coins_btc_amount', formatCoinBtc(coin.valueSats))}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-gray-500">
            <span className="font-mono" title={coin.outpoint}>{formatOutpoint(coin.outpoint)}</span>
            <span>{status}</span>
          </div>
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={busy}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {action.icon}
            {action.label}
          </button>
        )}
      </div>

      {(lock || coin.holdsAssets) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {coin.holdsAssets && <Badge tone="neutral">{t('coins_holds_assets')}</Badge>}
          {lock && offer && <Badge tone={locked ? "locked" : "neutral"}>{coinLockKindLabel(lock.kind)}</Badge>}
          {lock?.manual && <Badge tone="locked">{coinLockKindLabel('manual')}</Badge>}
          {lock?.unlocked && <Badge tone="neutral">{t('coins_unlocked')}</Badge>}
        </div>
      )}

      {lock && offer && (
        <p className="mt-2 text-xs text-gray-600">
          {[
            lock.refs.length === 0
              ? t('coins_funds_offers')
              : lock.refs.length === 1 ? t('coins_backs_one_offer') : t('coins_backs_offers', String(lock.refs.length)),
            ...(lock.origin ? [t('coins_offer_site', hostnameOf(lock.origin))] : []),
            ...(lock.expiresAt ? [t('coins_offer_expires', formatExpiry(lock.expiresAt))] : []),
          ].join(" · ")}
        </p>
      )}
    </article>
  );
}
