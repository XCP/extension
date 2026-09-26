/** How marketplace reviews write amounts, dates, and website-supplied text. */

import type { CanonicalPolicy } from '@/core/counterparty/policyOffer';
import { displayLocale, formatAmount } from '@/core/format';
import { t } from '@/i18n';

/**
 * A whole count — sats, UTXOs, items — in the language the wallet is reading in.
 *
 * `Number.prototype.toLocaleString()` with no argument follows the browser's REGIONAL FORMAT,
 * which is a different setting from the UI LANGUAGE these labels are drawn from. A reader can
 * have the two disagree. `formatAmount` follows the language, so the digits and the words around
 * them always come from one choice.
 */
export const grouped = (value: number): string => formatAmount({ value, maximumFractionDigits: 0 });

/** A satoshi amount with its unit. `sats` is a ticker, not a word to translate. */
export const satsValue = (value: number): string => `${grouped(value)} sats`;

export const formatXcpRaw = (raw: string): string => {
  const amount = BigInt(raw);
  const whole = amount / 100_000_000n;
  const fraction = (amount % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction} XCP` : `${whole} XCP`;
};

/** Expiry timestamps share rows with their labels; seconds-precision wraps them into a third line. */
export function formatExpiry(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(displayLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Keep website-supplied display text short enough that it cannot carry a sentence of its own. */
export const clipDisplayText = (value: string, max: number): string => {
  const characters = Array.from(value);
  return characters.length <= max ? value : `${characters.slice(0, max - 1).join('').trimEnd()}…`;
};

export const MAX_TARGET_COLLECTION_DISPLAY = 40;
export const MAX_TARGET_POLICY_DISPLAY = 60;

/** Website-supplied policy text reduced to one visible line. Presentation only: the hash commits
 * to the exact canonical string, which the wallet re-hashes before any of this is shown. */
const visibleText = (value: string, max: number): string => {
  const cleaned = value
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ')
    .trim();
  return clipDisplayText(cleaned.length > 0 ? cleaned : '?', max);
};

const MAX_POLICY_ARTIST_DISPLAY = 30;

/** A canonical policy in words: an asset name, or a quoted collection narrowed by its traits. */
export function describeCanonicalPolicy(policy: CanonicalPolicy): string {
  if (policy.scope === 'asset') return policy.asset ?? '?';
  const parts = [
    t('marketplace_intent_quoted_text', visibleText(policy.collection ?? '', MAX_TARGET_COLLECTION_DISPLAY)),
  ];
  // Years and series numbers are names, not quantities, so they are never digit-grouped.
  if (policy.series !== null) parts.push(t('marketplace_intent_policy_series', String(policy.series)));
  if (policy.artist !== null) {
    parts.push(t('marketplace_intent_policy_artist', t(
      'marketplace_intent_quoted_text', visibleText(policy.artist, MAX_POLICY_ARTIST_DISPLAY),
    )));
  }
  if (policy.issued_year !== null) parts.push(t('marketplace_intent_policy_issued_year', String(policy.issued_year)));
  if (policy.min_supply_units !== null) {
    parts.push(t('marketplace_intent_policy_min_supply', grouped(policy.min_supply_units)));
  }
  if (policy.max_supply_units !== null) {
    parts.push(t('marketplace_intent_policy_max_supply', grouped(policy.max_supply_units)));
  }
  return parts.join(' · ');
}

/**
 * What a policy-offer funding signature leaves standing, stated on the review: the offer can be
 * filled without another prompt until it expires (unix seconds) or the bidder cancels it by
 * spending a funding UTXO. Like mainstream wallets, this wallet keeps no list of marketplace keys.
 */
export function policyOfferStandingNotice(expiresAt: number): string {
  return t('marketplace_intent_notice_policy_offer_market_key', formatExpiry(expiresAt));
}
