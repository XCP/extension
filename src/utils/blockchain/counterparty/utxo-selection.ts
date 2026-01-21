/**
 * UTXO Selection for Counterparty Transactions
 *
 * Selects UTXOs for Counterparty transactions, filtering out those with
 * attached Counterparty assets. Uses mempool.space for fresh UTXO data.
 *
 * This follows the same approach as Horizon Wallet.
 */

import { fetchUTXOs, formatInputsSet, type UTXO } from '@/utils/blockchain/bitcoin/utxo';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';

/**
 * Maximum number of UTXOs to include in inputs_set (API limit).
 */
const MAX_INPUTS_SET = 20;

/**
 * Options for selecting UTXOs.
 */
export interface SelectUtxosOptions {
  /** Whether to include unconfirmed UTXOs */
  allowUnconfirmed?: boolean;
  /** Minimum number of UTXOs required (throws if not met) */
  minUtxos?: number;
  /** Maximum number of UTXOs to return */
  maxUtxos?: number;
}

/**
 * Result from UTXO selection.
 */
export interface SelectedUtxos {
  /** The selected UTXOs */
  utxos: UTXO[];
  /** Formatted inputs_set string for the Counterparty API */
  inputsSet: string;
  /** Total value of selected UTXOs in satoshis */
  totalValue: number;
  /** Number of UTXOs that were excluded due to attached assets */
  excludedWithAssets: number;
}

/**
 * Selects UTXOs for a Counterparty transaction, filtering out those with attached assets.
 * Fetches fresh UTXO data from mempool.space.
 *
 * 1. Fetch UTXOs from mempool.space (fresh data)
 * 2. Fetch UTXOs with attached assets in single API call
 * 3. Filter out UTXOs with attached assets
 * 4. Sort by value (highest first)
 * 5. Limit to MAX_INPUTS_SET UTXOs
 *
 * @param address - The address to select UTXOs for
 * @param options - Selection options
 * @returns Selected UTXOs and metadata
 */
export async function selectUtxosForTransaction(
  address: string,
  options: SelectUtxosOptions = {}
): Promise<SelectedUtxos> {
  const {
    allowUnconfirmed = false,
    minUtxos = 1,
    maxUtxos = MAX_INPUTS_SET,
  } = options;

  // 1. Fetch fresh UTXOs from mempool.space and UTXO balances from Counterparty in parallel
  const [allUtxos, utxoBalances] = await Promise.all([
    fetchUTXOs(address),
    fetchTokenBalances(address, { type: 'utxo', limit: 1000, verbose: false }),
  ]);

  if (allUtxos.length === 0) {
    throw new Error('No UTXOs available for this address');
  }

  // 2. Build set of UTXOs that have attached Counterparty assets
  const utxosWithAssets = new Set<string>();
  for (const balance of utxoBalances) {
    if (balance.utxo) {
      utxosWithAssets.add(balance.utxo);
    }
  }

  // 3. Filter UTXOs
  let excludedWithAssets = 0;
  const eligibleUtxos: UTXO[] = [];

  for (const utxo of allUtxos) {
    // Skip unconfirmed if not allowed
    if (!allowUnconfirmed && !utxo.status.confirmed) {
      continue;
    }

    // Skip if UTXO has attached Counterparty assets
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    if (utxosWithAssets.has(utxoKey)) {
      excludedWithAssets++;
      continue;
    }

    eligibleUtxos.push(utxo);
  }

  if (eligibleUtxos.length < minUtxos) {
    throw new Error(
      `Insufficient UTXOs: found ${eligibleUtxos.length}, need at least ${minUtxos}. ` +
      `${excludedWithAssets} UTXOs have attached assets.`
    );
  }

  // 4. Sort by value (highest first) to prefer larger UTXOs
  eligibleUtxos.sort((a, b) => b.value - a.value);

  // 5. Take up to maxUtxos
  const selectedUtxos = eligibleUtxos.slice(0, maxUtxos);

  // Calculate total value
  const totalValue = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);

  return {
    utxos: selectedUtxos,
    inputsSet: formatInputsSet(selectedUtxos),
    totalValue,
    excludedWithAssets,
  };
}
