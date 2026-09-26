/**
 * Script addresses an address of this wallet has already paid from the wallet's own flows.
 *
 * The script-address notice on the wallet's review screens is stated once per recipient: once an
 * address has paid a script address, or signed past the notice for it, paying it again from that
 * address shows nothing. Kept in local storage as (payer, recipient) pairs, both addresses already
 * public on chain once paid, so nothing derived from a secret is stored. Bounded to the most
 * recent entries.
 */

import { storage } from '#imports';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';

/** Pairs kept, most recent last. */
export const MAX_SCRIPT_RECIPIENTS = 500;

const scriptRecipientsItem = storage.defineItem<string[]>('local:scriptPaymentRecipients', {
  fallback: [],
});

const pairKey = (payer: string, recipient: string) =>
  `${normalizeAddressForComparison(payer)} ${normalizeAddressForComparison(recipient)}`;

async function readPairs(): Promise<string[]> {
  try {
    const value = await scriptRecipientsItem.getValue();
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

/** The script addresses `payer` has already paid, as recorded here. Empty when storage fails. */
export async function getKnownScriptRecipients(payer: string): Promise<string[]> {
  const prefix = `${normalizeAddressForComparison(payer)} `;
  return (await readPairs())
    .filter(entry => entry.startsWith(prefix))
    .map(entry => entry.slice(prefix.length));
}

/** Record that `payer` paid `recipients`. Best effort: a failed write only means a repeat notice. */
export async function recordScriptRecipients(payer: string, recipients: string[]): Promise<void> {
  if (recipients.length === 0) return;
  const added = recipients.map(recipient => pairKey(payer, recipient));
  const kept = (await readPairs()).filter(entry => !added.includes(entry));
  try {
    await scriptRecipientsItem.setValue([...kept, ...new Set(added)].slice(-MAX_SCRIPT_RECIPIENTS));
  } catch (err) {
    console.error('Failed to record script payment recipients:', err);
  }
}
