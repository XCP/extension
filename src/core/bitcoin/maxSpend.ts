import { getInputSizeForAddress } from '@/core/bitcoin/feeEstimation';

// Counterparty only emits change ABOVE its dust threshold (546 sats for legacy/P2SH,
// 330 for segwit). Keep an own output even when no ZELD is currently indexed: it also
// receives a possible hunt reward. The compose exposure guard remains authoritative.
export const MAX_CHANGE_RESERVE = 547;

/** Conservative budget, not a fee quote. Review shows the actual composed fee/change. */
export function estimateMaxSpendBudget({
  inputCount,
  sourceAddress,
  feeRate,
  destinationCount = 1,
  extraOutputCount = 0,
  memo = '',
}: {
  inputCount: number;
  sourceAddress: string;
  feeRate: number;
  destinationCount?: number;
  extraOutputCount?: number;
  memo?: string;
}): { fee: number; retained: number; total: number } {
  // 43 bytes covers standard destination scripts, including taproot; leave room for
  // variable signatures, a protocol output, additional send entries and UTF-8 memos.
  const vbytes = Math.ceil(10.5 + inputCount * (getInputSizeForAddress(sourceAddress) + 2)
    + (destinationCount + extraOutputCount + 1) * 43
    + 90 + Math.max(0, destinationCount - 1) * 34 + new TextEncoder().encode(memo).length);
  const fee = Math.ceil(vbytes * feeRate);
  // An accompanying asset send/sweep may also need a dust-valued recipient output.
  const retained = MAX_CHANGE_RESERVE + extraOutputCount * 546;
  return { fee, retained, total: fee + retained };
}
