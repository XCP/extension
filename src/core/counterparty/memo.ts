/**
 * Memo utilities for Counterparty transactions
 * Wraps the centralized validation utilities with Counterparty-specific defaults.
 *
 * A memo is hex only when it is written with an explicit `0x`/`0X` prefix; everything else is
 * sent as text (see `isHexMemo`).
 */

import { validateMemoLength } from '@/core/validation/memo';

export { hasHexPrefix, isHexMemo, stripHexPrefix } from '@/core/validation/memo';

// Counterparty default is 34 bytes, not 80
export function isValidMemoLength(memo: string, isHex: boolean, maxBytes: number = 34): boolean {
  return validateMemoLength(memo, isHex, maxBytes);
}

/**
 * Per-send MPMA memos as one form field. A memo is free text and may itself hold a comma (a
 * quoted CSV field), so the list travels as a JSON array rather than joined on commas; Core
 * receives it as repeated `memos` keys (`composeMPMA`), which carry commas intact.
 */
export function encodeMemoList(memos: readonly string[]): string {
  return JSON.stringify(memos);
}

/**
 * The per-send memos of an MPMA request: an array as given, the JSON array `encodeMemoList`
 * writes, or a plain comma-separated list from a caller whose memos hold no commas. Null when
 * there is no list.
 */
export function decodeMemoList(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.every((memo) => typeof memo === 'string') ? value : null;
  if (typeof value !== 'string' || value === '') return null;
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((memo) => typeof memo === 'string')) return parsed;
    } catch {
      // Not JSON: a comma-separated list whose first memo starts with a bracket.
    }
  }
  return value.split(',');
}
