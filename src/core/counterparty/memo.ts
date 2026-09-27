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
