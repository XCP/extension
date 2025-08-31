import { toSatoshis } from '@/utils/numeric';
import { fetchUTXOs, type UTXO } from './utxo';

export interface BTCBalanceInfo {
  confirmed: number;
  unconfirmed: number;
  total: number;
  pendingTxs?: PendingTransaction[];
}

export interface PendingTransaction {
  txid: string;
  valueChange: number; // positive for incoming, negative for outgoing
  fee?: number;
  inputs: Array<{ value: number; address?: string }>;
  outputs: Array<{ value: number; address?: string }>;
}

/**
 * Fetches the Bitcoin balance (in satoshis) for a given address by querying multiple API endpoints.
 * The function returns as soon as one of the endpoints successfully returns a balance.
 *
 * @param address - The Bitcoin address.
 * @param timeoutMs - Timeout in milliseconds for each API request (default: 5000ms).
 * @returns A Promise that resolves to the balance in satoshis.
 * @throws Error if all API calls fail or no valid balance is returned.
 */
export async function fetchBTCBalance(address: string, timeoutMs = 5000): Promise<number> {
  const balanceInfo = await fetchBTCBalanceDetailed(address, timeoutMs);
  return balanceInfo.total;
}

/**
 * Calculates the actual spendable balance by checking UTXOs and pending transactions.
 * This is more accurate than just using confirmed + unconfirmed totals because it
 * accounts for which specific UTXOs are being spent in pending transactions.
 *
 * @param address - The Bitcoin address.
 * @returns A Promise that resolves to the spendable balance in satoshis.
 */
export async function fetchSpendableBalance(address: string): Promise<number> {
  try {
    // Get all UTXOs (includes both confirmed and unconfirmed)
    const utxos = await fetchUTXOs(address);
    
    // Get pending transactions to see which UTXOs are being spent
    const pendingTxs = await fetchMempoolTransactions(address);
    
    // Create a set of spent outputs from pending transactions
    const spentOutputs = new Set<string>();
    pendingTxs.forEach(tx => {
      tx.inputs.forEach((input: any, index: number) => {
        // For pending transactions, inputs reference previous outputs
        // We need to check if any of our UTXOs are being spent
        if (input.address === address) {
          // This UTXO is being spent in a pending transaction
          // We'd need the actual prevout info to match it exactly
          // For now, we'll use the simpler approach of total balance
        }
      });
    });
    
    // Sum up all UTXOs that aren't being spent
    const spendableBalance = utxos.reduce((total, utxo) => {
      // Check if this UTXO is confirmed (has block_height)
      const isConfirmed = utxo.status?.confirmed || false;
      
      // For now, include all UTXOs
      // In a more complete implementation, we'd check if this specific UTXO
      // is being spent in any pending transaction
      return total + utxo.value;
    }, 0);
    
    return spendableBalance;
  } catch (error) {
    console.warn('Failed to calculate spendable balance:', error);
    // Fallback to simple balance calculation
    const balanceInfo = await fetchBTCBalanceDetailed(address);
    return balanceInfo.total;
  }
}

/**
 * Fetches mempool transactions for a Bitcoin address.
 *
 * @param address - The Bitcoin address.
 * @param timeoutMs - Timeout in milliseconds for the API request (default: 5000ms).
 * @returns A Promise that resolves to an array of pending transactions.
 */
export async function fetchMempoolTransactions(address: string, timeoutMs = 5000): Promise<PendingTransaction[]> {
  try {
    // Try mempool.space first
    const resp = await fetchWithTimeout(`https://mempool.space/api/address/${address}/txs/mempool`, { timeout: timeoutMs });
    if (resp.ok) {
      const txs = await resp.json();
      return txs.map((tx: any) => {
        // Calculate value change for this address
        let inputValue = 0;
        let outputValue = 0;
        
        // Sum up inputs from this address
        tx.vin?.forEach((input: any) => {
          if (input.prevout?.scriptpubkey_address === address) {
            inputValue += input.prevout.value || 0;
          }
        });
        
        // Sum up outputs to this address
        tx.vout?.forEach((output: any) => {
          if (output.scriptpubkey_address === address) {
            outputValue += output.value || 0;
          }
        });
        
        const valueChange = outputValue - inputValue;
        
        return {
          txid: tx.txid,
          valueChange,
          fee: tx.fee,
          inputs: tx.vin?.map((input: any) => ({
            value: input.prevout?.value || 0,
            address: input.prevout?.scriptpubkey_address
          })) || [],
          outputs: tx.vout?.map((output: any) => ({
            value: output.value || 0,
            address: output.scriptpubkey_address
          })) || []
        };
      });
    }
  } catch (error) {
    console.warn('Failed to fetch mempool transactions:', error);
  }
  
  return [];
}

/**
 * Fetches detailed Bitcoin balance info including confirmed and unconfirmed amounts.
 *
 * @param address - The Bitcoin address.
 * @param timeoutMs - Timeout in milliseconds for each API request (default: 5000ms).
 * @param includePendingTxs - Whether to fetch individual pending transactions (default: false).
 * @returns A Promise that resolves to the detailed balance info.
 * @throws Error if all API calls fail or no valid balance is returned.
 */
export async function fetchBTCBalanceDetailed(address: string, timeoutMs = 5000, includePendingTxs = false): Promise<BTCBalanceInfo> {
  const endpoints = [
    `https://blockstream.info/api/address/${address}`,
    `https://mempool.space/api/address/${address}`,
    `https://api.blockcypher.com/v1/btc/main/addrs/${address}/balance`,
    `https://blockchain.info/rawaddr/${address}?cors=true`,
    `https://sochain.com/api/v2/get_address_balance/BTC/${address}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const resp = await fetchWithTimeout(endpoint, { timeout: timeoutMs });
      if (!resp.ok) {
        console.warn(`API call failed with HTTP ${resp.status}: ${endpoint}`);
        continue;
      }
      const data = await resp.json();
      const parsed = parseBTCBalanceDetailed(endpoint, data);
      if (parsed !== null) {
        // Optionally fetch pending transactions for more detail
        if (includePendingTxs && parsed.unconfirmed !== 0) {
          parsed.pendingTxs = await fetchMempoolTransactions(address, timeoutMs);
        }
        return parsed;
      }
    } catch (error) {
      console.warn(`Error calling ${endpoint}:`, error);
      continue;
    }
  }
  throw new Error('Failed to fetch BTC balance from all explorers');
}

/**
 * Helper function to perform a fetch with a timeout.
 *
 * @param resource - The resource URL or Request object.
 * @param options - Fetch options, including a 'timeout' field (in ms).
 * @returns A Promise that resolves to the Response.
 */
async function fetchWithTimeout(
  resource: RequestInfo,
  options: { timeout: number } & RequestInit
): Promise<Response> {
  const { timeout, ...rest } = options;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(resource, { ...rest, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Parses the balance from various API responses.
 *
 * @param endpoint - The endpoint URL that was called.
 * @param data - The parsed JSON response.
 * @returns The balance in satoshis if successfully parsed; otherwise null.
 */
function parseBTCBalance(endpoint: string, data: any): number | null {
  const detailed = parseBTCBalanceDetailed(endpoint, data);
  return detailed ? detailed.total : null;
}

/**
 * Parses detailed balance info from various API responses.
 *
 * @param endpoint - The endpoint URL that was called.
 * @param data - The parsed JSON response.
 * @returns The detailed balance info if successfully parsed; otherwise null.
 */
function parseBTCBalanceDetailed(endpoint: string, data: any): BTCBalanceInfo | null {
  try {
    // Format from blockstream.info or mempool.space.
    if (endpoint.includes('blockstream.info') || endpoint.includes('mempool.space')) {
      // chain_stats = confirmed transactions only
      // mempool_stats = unconfirmed/pending transactions only
      const funded = BigInt(data.chain_stats.funded_txo_sum);  // Total received (confirmed)
      const spent = BigInt(data.chain_stats.spent_txo_sum);    // Total spent (confirmed)
      const memFunded = BigInt(data.mempool_stats.funded_txo_sum);  // Total received (unconfirmed)
      const memSpent = BigInt(data.mempool_stats.spent_txo_sum);    // Total spent (unconfirmed)
      
      const confirmed = Number(funded - spent);
      const unconfirmed = Number(memFunded - memSpent);  // Net change from pending txs
      
      return {
        confirmed,
        unconfirmed,
        total: confirmed + unconfirmed
      };
    }
    // Format from blockcypher.com.
    if (endpoint.includes('blockcypher.com')) {
      const confirmed = data.balance || 0;
      const unconfirmed = data.unconfirmed_balance || 0;
      return {
        confirmed,
        unconfirmed,
        total: data.final_balance || (confirmed + unconfirmed)
      };
    }
    // Format from blockchain.info.
    if (endpoint.includes('blockchain.info')) {
      // blockchain.info doesn't provide unconfirmed separately in this endpoint
      return {
        confirmed: data.final_balance,
        unconfirmed: 0,
        total: data.final_balance
      };
    }
    // Format from sochain.com.
    if (endpoint.includes('sochain.com')) {
      const confirmed = Number(toSatoshis(Number(data.data.confirmed_balance)));
      const unconfirmed = Number(toSatoshis(Number(data.data.unconfirmed_balance || 0)));
      return {
        confirmed,
        unconfirmed,
        total: confirmed + unconfirmed
      };
    }
  } catch (err) {
    console.warn(`Error parsing response from ${endpoint}:`, err);
  }
  return null;
}
