import axios from 'axios';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';

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
 * Fetches the UTXOs for a given Bitcoin address.
 *
 * @param address - The Bitcoin address to fetch UTXOs for.
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns A promise that resolves to an array of UTXO objects.
 */
export async function fetchUTXOs(address: string, signal?: AbortSignal): Promise<UTXO[]> {
  try {
    const response = await axios.get<UTXO[]>(
      `https://mempool.space/api/address/${address}/utxo`,
      { signal }
    );
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) {
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
 *
 * @param txid - Transaction ID in hex.
 * @returns A promise that resolves to the raw transaction hex string or null if not found.
 */
export async function fetchPreviousRawTransaction(txid: string): Promise<string | null> {
  try {
    const settings = await getKeychainSettings();
    const response = await axios.get<{ result: any }>(
      `${settings.counterpartyApiBase}/v2/bitcoin/transactions/${txid}`
    );

    if (response.data && response.data.result && response.data.result.hasOwnProperty('hex') && response.data.result.hex !== undefined) {
      return response.data.result.hex;
    } else {
      console.error(`Raw transaction hex not found for txid: ${txid}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching raw transaction for txid ${txid}:`, error);
    return null;
  }
}

/**
 * Fetches detailed Bitcoin transaction information for a given txid.
 *
 * @param txid - Transaction ID in hex.
 * @returns A promise that resolves to the Bitcoin transaction details or null if not found.
 */
export async function fetchBitcoinTransaction(txid: string): Promise<any | null> {
  try {
    const settings = await getKeychainSettings();
    const response = await axios.get<{ result: any }>(
      `${settings.counterpartyApiBase}/v2/bitcoin/transactions/${txid}`
    );

    if (response.data && response.data.result) {
      return response.data.result;
    } else {
      console.error(`Transaction details not found for txid: ${txid}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching Bitcoin transaction for txid ${txid}:`, error);
    return null;
  }
}
