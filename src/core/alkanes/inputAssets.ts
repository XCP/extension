import { type AlkaneBalance, fetchAlkanesByOutpoint, fetchAlkanesIndexedHeight } from '@/core/alkanes/api';
import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { fetchTransactionChainStatus } from '@/core/bitcoin/utxo';
import { getActiveSettings } from '@/core/settings';

export interface InputAlkaneBalances {
  inputIndex: number;
  utxo: string;
  balances: AlkaneBalance[];
  /** The indexer did not prove this input empty. */
  lookupFailed?: boolean;
  unknownReason?: 'not-checked' | 'unconfirmed' | 'indexer-behind' | 'lookup-failed';
}

export const MAX_ALKANES_LOOKUP_INPUTS = 30;

export function classifySignedInputAlkanes(
  entries: InputAlkaneBalances[],
  signedInputIndices: number[],
): {
  withBalances: InputAlkaneBalances[];
  unknownStatus: InputAlkaneBalances[];
} {
  const signed = new Set(signedInputIndices);
  return {
    withBalances: entries.filter(
      (entry) => signed.has(entry.inputIndex) && entry.balances.length > 0,
    ),
    unknownStatus: entries.filter(
      (entry) => signed.has(entry.inputIndex) && entry.lookupFailed,
    ),
  };
}

/**
 * Check signed inputs first and report every token-bearing or unknown input. Confirmed-empty inputs are
 * omitted. This mirrors Counterparty attached-asset approval semantics but intentionally does not
 * trust the Counterparty recent-broadcast journal: that journal has no knowledge of Alkanes.
 */
export async function fetchInputsAlkanes(
  inputs: Array<{
    index: number; txid: string; vout: number;
    /** Fresh Bitcoin explorer status, when discovery already fetched it. Never an Alkane id height. */
    confirmed?: boolean; blockHeight?: number;
  }>,
  signedInputIndices: number[] = [],
): Promise<InputAlkaneBalances[]> {
  const signed = new Set(signedInputIndices);
  const prioritized = [...inputs].sort(
    (a, b) => Number(signed.has(b.index)) - Number(signed.has(a.index)),
  );
  const checked = prioritized.slice(0, MAX_ALKANES_LOOKUP_INPUTS);
  const displaced = prioritized.slice(MAX_ALKANES_LOOKUP_INPUTS);
  const apiBase = getActiveSettings().alkanesApiBase;

  const unknown = (input: typeof inputs[number], reason: InputAlkaneBalances['unknownReason']): InputAlkaneBalances => ({
    inputIndex: input.index, utxo: `${input.txid}:${input.vout}`,
    balances: [], lookupFailed: true, unknownReason: reason,
  });
  // Empty sheets also describe nonexistent/not-yet-indexed outpoints. Establish the processed
  // height BEFORE reading sheets, using an independent Bitcoin tip, and never cache emptiness.
  let provedHeight: number;
  try {
    const bitcoinHeight = await getCurrentBlockHeight(true);
    const indexedHeight = await fetchAlkanesIndexedHeight(apiBase);
    if (!Number.isSafeInteger(bitcoinHeight) || bitcoinHeight <= 0 || indexedHeight < bitcoinHeight) {
      return prioritized.map(input => unknown(input, 'indexer-behind'));
    }
    provedHeight = bitcoinHeight;
  } catch {
    return prioritized.map(input => unknown(input, 'lookup-failed'));
  }

  const results = await Promise.all(checked.map(async (input): Promise<InputAlkaneBalances | null> => {
    const utxo = `${input.txid}:${input.vout}`;
    try {
      const status = input.confirmed !== undefined
        ? { confirmed: input.confirmed, block_height: input.blockHeight }
        : await fetchTransactionChainStatus(input.txid);
      if (!status?.confirmed || !Number.isSafeInteger(status.block_height)
        || status.block_height! <= 0 || status.block_height! > provedHeight) {
        return unknown(input, 'unconfirmed');
      }
      const balances = await fetchAlkanesByOutpoint(input.txid, input.vout, apiBase);
      return balances.length > 0 ? { inputIndex: input.index, utxo, balances } : null;
    } catch (error) {
      console.warn(`Failed to fetch Alkanes balances for ${utxo}:`, error);
      return unknown(input, 'lookup-failed');
    }
  }));

  // A new block (or a lower tip after a reorg) invalidates empty results from this read window.
  try {
    if (await fetchAlkanesIndexedHeight(apiBase) < provedHeight
      || await getCurrentBlockHeight(true) !== provedHeight) {
      return prioritized.map(input => unknown(input, 'indexer-behind'));
    }
  } catch {
    return prioritized.map(input => unknown(input, 'lookup-failed'));
  }

  return [
    ...results.filter((result): result is InputAlkaneBalances => result !== null),
    ...displaced.map((input) => ({
      inputIndex: input.index,
      utxo: `${input.txid}:${input.vout}`,
      balances: [],
      lookupFailed: true as const,
      unknownReason: 'not-checked' as const,
    })),
  ];
}
