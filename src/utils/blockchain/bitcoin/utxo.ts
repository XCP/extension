import { apiClient, isCancel } from '@/utils/apiClient';
import { walletManager } from '@/utils/wallet/walletManager';

/**
 * Bitcoin transaction details from the Counterparty API.
 */
export interface BitcoinTransaction {
  hex: string;
  txid: string;
  version: number;
  locktime: number;
  size: number;
  vsize: number;
  weight: number;
  vin: Array<{
    txid: string;
    vout: number;
    scriptSig?: { asm: string; hex: string };
    txinwitness?: string[];
    sequence: number;
  }>;
  vout: Array<{
    value: number;
    n: number;
    scriptPubKey: {
      asm: string;
      hex: string;
      type: string;
      address?: string;
    };
  }>;
}

/**
 * Interface representing an Unspent Transaction Output (UTXO).
 */
export interface UTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
}

/**
 * Type guard to validate UTXO array structure.
 */
function isValidUtxoArray(data: unknown): data is UTXO[] {
  if (!Array.isArray(data)) {
    return false;
  }
  // Validate first item if array is not empty (avoid checking all items for performance)
  if (data.length > 0) {
    const first = data[0];
    return (
      typeof first === 'object' &&
      first !== null &&
      typeof first.txid === 'string' &&
      typeof first.vout === 'number' &&
      typeof first.value === 'number'
    );
  }
  return true;
}

/**
 * Fetches the UTXOs for a given Bitcoin address.
 *
 * @param address - The Bitcoin address to fetch UTXOs for.
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns A promise that resolves to an array of UTXO objects.
 */
export async function fetchUTXOs(address: string, signal?: AbortSignal): Promise<UTXO[]> {
  try {
    // Use quickApiClient with 10 second timeout for UTXO lookups
    const response = await apiClient.get<unknown>(
      `https://mempool.space/api/address/${address}/utxo`,
      { signal }
    );

    // Validate response structure
    if (!isValidUtxoArray(response.data)) {
      console.error(`Invalid UTXO response format for address ${address}`);
      throw new Error('Invalid UTXO response: expected array of UTXOs');
    }

    return response.data;
  } catch (error) {
    if (isCancel(error)) {
      throw error; // Re-throw cancellation errors
    }
    console.error(`Error fetching UTXOs for address ${address}:`, error);
    throw new Error('Failed to fetch UTXOs.');
  }
}

/**
 * Formats the `inputs_set` parameter for the Counterparty API from a list of UTXOs.
 *
 * @param utxos - An array of UTXO objects.
 * @returns A string representing the `inputs_set`, formatted as "txid:vout,txid:vout,..."
 */
export function formatInputsSet(utxos: UTXO[]): string {
  return utxos.map((utxo) => `${utxo.txid}:${utxo.vout}`).join(',');
}

/**
 * Gets a specific UTXO by its transaction ID and output index from a list of UTXOs.
 *
 * @param utxos - Array of UTXOs to search through
 * @param txid - The transaction ID to look for
 * @param vout - The output index within the transaction
 * @returns The matching UTXO or undefined if not found
 */
export function getUtxoByTxid(utxos: UTXO[], txid: string, vout: number): UTXO | undefined {
  return utxos.find((utxo) => utxo.txid === txid && utxo.vout === vout);
}

/**
 * Fetches the raw transaction hex for a given txid.
 * Tries Counterparty API first, falls back to mempool.space for unconfirmed txs.
 *
 * @param txid - Transaction ID in hex.
 * @returns A promise that resolves to the raw transaction hex string or null if not found.
 */
export async function fetchPreviousRawTransaction(txid: string): Promise<string | null> {
  // Try Counterparty API first
  try {
    const settings = walletManager.getSettings();
    const response = await apiClient.get<{ result: BitcoinTransaction }>(
      `${settings.counterpartyApiBase}/v2/bitcoin/transactions/${txid}`
    );

    if (typeof response.data?.result?.hex === 'string') {
      return response.data.result.hex;
    }
  } catch {
    // Fall through to mempool.space
  }

  // Fallback to mempool.space (handles unconfirmed txs better)
  try {
    const response = await apiClient.get<string>(
      `https://mempool.space/api/tx/${txid}/hex`
    );

    if (typeof response.data === 'string' && response.data.length > 0) {
      return response.data;
    }
  } catch {
    // Both sources failed
  }

  return null;
}

/**
 * Transaction status from mempool.space.
 */
interface MempoolTxStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

/**
 * Extended Bitcoin transaction with status information.
 */
export interface BitcoinTransactionWithStatus extends BitcoinTransaction {
  status?: MempoolTxStatus;
  blocktime?: number;
}

/**
 * Fetches detailed Bitcoin transaction information for a given txid.
 * Includes confirmation status and block time from mempool.space.
 *
 * @param txid - Transaction ID in hex.
 * @returns A promise that resolves to the Bitcoin transaction details or null if not found.
 */
export async function fetchBitcoinTransaction(txid: string): Promise<BitcoinTransactionWithStatus | null> {
  try {
    const settings = walletManager.getSettings();

    // Fetch from both Counterparty API and mempool.space in parallel
    const [counterpartyResponse, mempoolResponse] = await Promise.all([
      apiClient.get<{ result: BitcoinTransaction }>(
        `${settings.counterpartyApiBase}/v2/bitcoin/transactions/${txid}`
      ),
      apiClient.get<MempoolTxStatus>(
        `https://mempool.space/api/tx/${txid}/status`
      ).catch(() => null) // Don't fail if mempool.space is unavailable
    ]);

    if (counterpartyResponse.data && counterpartyResponse.data.result) {
      const result: BitcoinTransactionWithStatus = counterpartyResponse.data.result;

      // Add status info from mempool.space if available
      if (mempoolResponse?.data) {
        result.status = mempoolResponse.data;
        result.blocktime = mempoolResponse.data.block_time;
      }

      return result;
    } else {
      console.error(`Transaction details not found for txid: ${txid}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching Bitcoin transaction for txid ${txid}:`, error);
    return null;
  }
}

