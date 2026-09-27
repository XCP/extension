/**
 * The wallet's own record of which of its outputs carry ZELD.
 *
 * The indexer is the authority, but a site's signing request should not be read as ZELD-free just
 * because the indexer is down: the six-zero txid heuristic finds a hunt's reward output and
 * nothing else, so ZELD that has already moved once (onto change, onto an attached asset's UTXO)
 * sits on an ordinary-looking txid. This record keeps the last answer the wallet saw for each of
 * its addresses, plus what its own ZELD transactions left behind, so an outage falls back to that
 * rather than to "nothing".
 *
 * It lives in the encrypted keychain, beside the script-address record: an address with the
 * outpoints it holds is the user's own linkable data, the vault already keeps such lists private,
 * a write only re-encrypts under the session key, and a wallet reset forgets it with everything
 * else. Entries are strings `"<address> <txid>:<vout> <base units | ?>"`, most recent last, bounded
 * per address and overall. Nothing that moves money reads it: it only chooses which notices an
 * approval shows.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';

/** Outpoints kept per address. A wallet rarely holds more than a handful of ZELD outputs. */
export const MAX_ZELD_OUTPOINTS_PER_ADDRESS = 200;
/** Entries kept across every address. */
export const MAX_ZELD_OUTPOINT_ENTRIES = 2_000;
/** Outpoints one call may record or remove. */
export const MAX_ZELD_OUTPOINTS_PER_UPDATE = 500;

export interface KnownZeldOutpoint {
  /** `txid:vout`, txid in lowercase hex. */
  outpoint: string;
  /** ZELD base units as a decimal string, or undefined when the amount was not known (a fresh reward). */
  balance?: string;
}

export interface ZeldOutpointUpdate {
  /** The indexer's full current answer for the address: replaces everything recorded for it. */
  replace?: KnownZeldOutpoint[];
  /** Outputs the wallet's own transaction left ZELD on. */
  add?: KnownZeldOutpoint[];
  /** Outpoints the wallet's own transaction spent. */
  remove?: string[];
}

const OUTPOINT = /^[0-9a-f]{64}:\d{1,10}$/;
const ENTRY = /^\S+ [0-9a-f]{64}:\d{1,10} (\d{1,30}|\?)$/;

function normalizeOutpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return OUTPOINT.test(lower) ? lower : null;
}

function normalizeBalance(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{1,30}$/.test(value) ? value : undefined;
}

const entryFor = (address: string, known: KnownZeldOutpoint) =>
  `${address} ${known.outpoint} ${known.balance ?? '?'}`;

/** The stored list, keeping only well-formed entries, at most the most recent MAX. */
export function sanitizeZeldOutpointEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && ENTRY.test(entry))
    .slice(-MAX_ZELD_OUTPOINT_ENTRIES);
}

/** What `entries` records for `address`, oldest first. */
export function knownZeldOutpoints(entries: readonly string[], address: string): KnownZeldOutpoint[] {
  const prefix = `${normalizeAddressForComparison(address)} `;
  return entries.filter(entry => entry.startsWith(prefix)).map((entry) => {
    const [outpoint = '', balance = '?'] = entry.slice(prefix.length).split(' ');
    return balance === '?' ? { outpoint } : { outpoint, balance };
  });
}

/** Validate a caller's update before it reaches the keychain. Throws on anything malformed. */
export function parseZeldOutpointUpdate(value: unknown): ZeldOutpointUpdate {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid ZELD outpoint update');
  const record = value as Record<string, unknown>;
  const list = (field: unknown): unknown[] => {
    if (field === undefined) return [];
    if (!Array.isArray(field) || field.length > MAX_ZELD_OUTPOINTS_PER_UPDATE) {
      throw new Error('Invalid ZELD outpoint update');
    }
    return field;
  };
  const known = (field: unknown): KnownZeldOutpoint[] => list(field).map((item) => {
    const entry = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
    const outpoint = normalizeOutpoint(entry.outpoint);
    if (!outpoint) throw new Error('Invalid ZELD outpoint update');
    const balance = normalizeBalance(entry.balance);
    return balance === undefined ? { outpoint } : { outpoint, balance };
  });
  const update: ZeldOutpointUpdate = {};
  if (record.replace !== undefined) update.replace = known(record.replace);
  if (record.add !== undefined) update.add = known(record.add);
  if (record.remove !== undefined) {
    update.remove = list(record.remove).map((item) => {
      const outpoint = normalizeOutpoint(item);
      if (!outpoint) throw new Error('Invalid ZELD outpoint update');
      return outpoint;
    });
  }
  return update;
}

/**
 * `entries` with `update` applied to `address`, or null when nothing changes, so an unchanged
 * balance read costs no keychain write.
 */
export function withZeldOutpoints(
  entries: readonly string[],
  address: string,
  update: ZeldOutpointUpdate,
): string[] | null {
  const key = normalizeAddressForComparison(address);
  const prefix = `${key} `;
  const current = knownZeldOutpoints(entries, address);
  let next: KnownZeldOutpoint[];
  if (update.replace) {
    next = update.replace;
  } else {
    const removed = new Set(update.remove ?? []);
    const added = new Map((update.add ?? []).map(item => [item.outpoint, item]));
    next = [
      ...current.filter(item => !removed.has(item.outpoint) && !added.has(item.outpoint)),
      ...added.values(),
    ];
  }
  const unique = [...new Map(next.map(item => [item.outpoint, item])).values()]
    .slice(-MAX_ZELD_OUTPOINTS_PER_ADDRESS);
  const nextEntries = unique.map(item => entryFor(key, item));
  const currentEntries = current.map(item => entryFor(key, item));
  if (nextEntries.length === currentEntries.length && nextEntries.every((entry, i) => entry === currentEntries[i])) {
    return null;
  }
  return [...entries.filter(entry => !entry.startsWith(prefix)), ...nextEntries].slice(-MAX_ZELD_OUTPOINT_ENTRIES);
}
