/**
 * Script addresses an address of this wallet has already paid from the wallet's own flows.
 *
 * The script-address notice on the wallet's review screens is stated once per recipient: once an
 * address has paid a script address, or signed past the notice for it, paying it again from that
 * address shows nothing. The list is kept as (payer, recipient) pairs inside the encrypted
 * keychain: together they name this wallet's addresses and whom they paid, which the vault
 * otherwise keeps private, and a wallet reset forgets them with everything else. Bounded to the
 * most recent entries.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';

/** Pairs kept, most recent last. */
export const MAX_SCRIPT_RECIPIENTS = 500;

/** Recipients one call may record: a transaction pays only a handful of script addresses. */
export const MAX_RECIPIENTS_PER_RECORD = 100;

const pairKey = (payer: string, recipient: string) =>
  `${normalizeAddressForComparison(payer)} ${normalizeAddressForComparison(recipient)}`;

/** The stored list, keeping only well-formed entries, at most the most recent MAX. */
export function sanitizeScriptRecipientPairs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string').slice(-MAX_SCRIPT_RECIPIENTS);
}

/** The script addresses `payer` has already paid, as recorded in `pairs`. */
export function knownScriptRecipients(pairs: readonly string[], payer: string): string[] {
  const prefix = `${normalizeAddressForComparison(payer)} `;
  return pairs.filter(entry => entry.startsWith(prefix)).map(entry => entry.slice(prefix.length));
}

/**
 * `pairs` with `payer` → `recipients` recorded as the most recent entries, or null when every one
 * of them is already recorded, so nothing needs writing.
 */
export function withScriptRecipients(pairs: readonly string[], payer: string, recipients: readonly string[]): string[] | null {
  const added = [...new Set(recipients.map(recipient => pairKey(payer, recipient)))];
  if (added.every(entry => pairs.includes(entry))) return null;
  const kept = pairs.filter(entry => !added.includes(entry));
  return [...kept, ...added].slice(-MAX_SCRIPT_RECIPIENTS);
}
