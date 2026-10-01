/**
 * How a locked coin (core/bitcoin/coinLocks.ts) is named on screen: the Coins settings page and
 * the approval that asks before a site spends one say it the same way.
 */

import type { CoinLockKind } from '@/core/bitcoin/coinLocks';
import { formatAmount, formatTxid } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';
import { t } from '@/i18n';

/** Why a coin is locked, as its badge says it. */
export function coinLockKindLabel(kind: CoinLockKind): string {
  switch (kind) {
    case 'manual': return t('coins_kind_manual');
    case 'offer_slot': return t('coins_kind_offer_slot');
    case 'collection_offer': return t('coins_kind_collection_offer');
  }
}

/** A satoshi value in BTC, eight places, as the wallet shows BTC amounts elsewhere. */
export function formatCoinBtc(sats: number): string {
  return formatAmount({ value: fromSatoshis(sats, true), minimumFractionDigits: 8, maximumFractionDigits: 8 });
}

/** `txid:vout` shortened the way transaction ids are, keeping the output index whole. */
export function formatOutpoint(outpoint: string): string {
  const separator = outpoint.lastIndexOf(':');
  return separator < 0 ? formatTxid(outpoint) : `${formatTxid(outpoint.slice(0, separator))}:${outpoint.slice(separator + 1)}`;
}
