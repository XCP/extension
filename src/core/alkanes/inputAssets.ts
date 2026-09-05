import { type AlkaneBalance, fetchAlkanesByOutpoint } from '@/core/alkanes/api';

export interface InputAlkaneBalances {
  inputIndex: number;
  utxo: string;
  balances: AlkaneBalance[];
  /** The indexer did not prove this input empty. */
  lookupFailed?: boolean;
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
  inputs: Array<{ index: number; txid: string; vout: number }>,
  signedInputIndices: number[] = [],
): Promise<InputAlkaneBalances[]> {
  const signed = new Set(signedInputIndices);
  const prioritized = [...inputs].sort(
    (a, b) => Number(signed.has(b.index)) - Number(signed.has(a.index)),
  );
  const checked = prioritized.slice(0, MAX_ALKANES_LOOKUP_INPUTS);
  const displaced = prioritized.slice(MAX_ALKANES_LOOKUP_INPUTS);

  const results = await Promise.all(checked.map(async (input): Promise<InputAlkaneBalances | null> => {
    const utxo = `${input.txid}:${input.vout}`;
    try {
      const balances = await fetchAlkanesByOutpoint(input.txid, input.vout);
      return balances.length > 0 ? { inputIndex: input.index, utxo, balances } : null;
    } catch (error) {
      console.warn(`Failed to fetch Alkanes balances for ${utxo}:`, error);
      return { inputIndex: input.index, utxo, balances: [], lookupFailed: true };
    }
  }));

  return [
    ...results.filter((result): result is InputAlkaneBalances => result !== null),
    ...displaced.map((input) => ({
      inputIndex: input.index,
      utxo: `${input.txid}:${input.vout}`,
      balances: [],
      lookupFailed: true as const,
    })),
  ];
}
