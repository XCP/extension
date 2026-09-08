import { parseAmountDraft } from '@/core/amount-contract/amounts';

/** Existing wallet policy: 0–50 percent with at most two decimal places. */
export function isValidSlippageDraft(draft: string): boolean {
  return parseAmountDraft(draft, { decimals: 2, maxRaw: 5000n }).status === 'valid';
}
