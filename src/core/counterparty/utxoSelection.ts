/**
 * UTXO Selection for Counterparty Transactions
 *
 * Selects UTXOs for Counterparty transactions, filtering out those with
 * attached Counterparty assets and the coins the wallet has locked (for an
 * offer, or by hand; see core/bitcoin/coinLocks). Uses mempool.space for fresh
 * UTXO data.
 *
 * This follows the same approach as Horizon Wallet.
 */

import { lockedOutpoints } from '@/core/bitcoin/coinLockStore';
import { outpointOf } from '@/core/bitcoin/coinLocks';
import { getPendingChangeUtxos, isUtxoRecentlySpent } from '@/core/bitcoin/spentUtxoCache';
import { fetchUTXOs, formatInputsSet, type UTXO } from '@/core/bitcoin/utxo';
import { fetchUtxosWithBalances } from '@/core/counterparty/api';

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
  /** Total value of UTXOs excluded due to attached assets in satoshis */
  excludedValue: number;
  /** Number of UTXOs left out because the wallet has them locked */
  excludedLocked: number;
  /** Total value of the locked UTXOs left out, in satoshis */
  excludedLockedValue: number;
}

/**
 * Selects UTXOs for a Counterparty transaction, filtering out those with attached assets.
 * Fetches fresh UTXO data from mempool.space.
 *
 * 1. Fetch UTXOs from mempool.space (fresh data)
 * 2. Check candidate UTXOs for attached assets in bounded batches
 * 3. Filter out locked UTXOs and UTXOs with attached assets
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

  const allUtxos = await fetchUTXOs(address);

  // Our own just-broadcast change, registered at broadcast time (core/counterparty/pendingChange)
  // because mempool.space takes a beat to list it. Deduped against the fetch — once the indexer
  // catches up the same outpoint arrives with real status and the virtual copy is redundant.
  // Virtual entries are unconfirmed by definition, so they answer to the same allowUnconfirmed
  // gate as everything else below.
  const fetched = new Set(allUtxos.map((utxo) => `${utxo.txid}:${utxo.vout}`));
  const virtualChange: UTXO[] = getPendingChangeUtxos(address)
    .filter(({ txid, vout }) => !fetched.has(`${txid}:${vout}`))
    .map(({ txid, vout, value }) => ({
      txid,
      vout,
      value,
      status: { confirmed: false, block_height: 0, block_hash: '', block_time: 0 },
    }));
  const candidateUtxos = [...allUtxos, ...virtualChange];

  if (candidateUtxos.length === 0) {
    throw new Error('No UTXOs available for this address');
  }

  // Read with the fetch just made, which is also what takes spent and orphaned locks off. A store
  // that cannot answer fails the selection: "no locks" would hand an offer's coin to the composer.
  const locked = await lockedOutpoints(address, allUtxos);
  const checkedCandidates = candidateUtxos.filter(utxo =>
    (allowUnconfirmed || utxo.status.confirmed) && !isUtxoRecentlySpent(utxo.txid, utxo.vout));
  const utxosWithAssets = await fetchUtxosWithBalances(checkedCandidates
    .map(utxo => `${utxo.txid}:${utxo.vout}`));

  // 3. Filter UTXOs
  let excludedWithAssets = 0;
  let excludedValue = 0;
  let excludedLocked = 0;
  let excludedLockedValue = 0;
  const eligibleUtxos: UTXO[] = [];

  // A spent-cache entry can expire during the lookup. Never reintroduce a candidate
  // skipped above: it was not checked for assets in this selection attempt.
  for (const utxo of checkedCandidates) {
    // Skip unconfirmed if not allowed
    if (!allowUnconfirmed && !utxo.status.confirmed) {
      continue;
    }

    // Skip UTXOs that were recently spent (prevents race conditions)
    if (isUtxoRecentlySpent(utxo.txid, utxo.vout)) {
      continue;
    }

    // Skip what the wallet has locked: an offer's funding, or a coin the user froze
    if (locked.has(outpointOf(utxo))) {
      excludedLocked++;
      excludedLockedValue += utxo.value;
      continue;
    }

    // Skip if UTXO has attached Counterparty assets
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    if (utxosWithAssets.has(utxoKey)) {
      excludedWithAssets++;
      excludedValue += utxo.value;
      continue;
    }

    eligibleUtxos.push(utxo);
  }

  if (eligibleUtxos.length < minUtxos) {
    throw new Error(
      `Insufficient UTXOs: found ${eligibleUtxos.length}, need at least ${minUtxos}. ` +
      `${excludedWithAssets} UTXOs have attached assets, ${excludedLocked} are locked.`
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
    excludedValue,
    excludedLocked,
    excludedLockedValue,
  };
}
