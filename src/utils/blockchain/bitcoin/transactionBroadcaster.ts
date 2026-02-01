import { apiClient, withRetry, isApiError, type ApiResponse } from '@/utils/apiClient';
import { walletManager } from '@/utils/wallet/walletManager';
import { clearApiCache } from '@/utils/blockchain/counterparty/api';

export interface TransactionResponse {
  txid: string;
  fees?: number;
}

/** Data payload types for different broadcast endpoints */
type BroadcastPayload = { tx: string } | string | null;

interface BroadcastEndpoint {
  name: string;
  getUrl: (signedTxHex: string) => string | Promise<string>;
  getData: (signedTxHex: string) => BroadcastPayload;
  headers: Record<string, string>;
}

const broadcastEndpoints: BroadcastEndpoint[] = [
  {
    name: 'counterparty',
    getUrl: async (signedTxHex: string) => {
      const settings = walletManager.getSettings();
      const encoded = encodeURIComponent(signedTxHex);
      return `${settings.counterpartyApiBase}/v2/bitcoin/transactions?signedhex=${encoded}`;
    },
    getData: () => null,
    headers: { 'Content-Type': 'application/json' },
  },
  {
    name: 'blockcypher',
    getUrl: () => 'https://api.blockcypher.com/v1/btc/main/txs/push',
    getData: (signedTxHex: string) => ({ tx: signedTxHex }),
    headers: { 'Content-Type': 'application/json' },
  },
  {
    name: 'blockstream',
    getUrl: () => 'https://blockstream.info/api/tx',
    getData: (signedTxHex: string) => signedTxHex,
    headers: { 'Content-Type': 'text/plain' },
  },
  {
    name: 'mempool',
    getUrl: () => 'https://mempool.space/api/tx',
    getData: (signedTxHex: string) => signedTxHex,
    headers: { 'Content-Type': 'text/plain' },
  },
];

const formatResponse = (endpoint: BroadcastEndpoint, response: ApiResponse): TransactionResponse | null => {
  try {
    const data = response.data as Record<string, unknown>;
    if (endpoint.name === 'counterparty') {
      const txid = data?.result as string | undefined;
      return txid ? { txid } : null;
    }
    if (endpoint.name === 'blockcypher') {
      const tx = data?.tx as { hash?: string; fees?: number } | undefined;
      return tx?.hash ? { txid: tx.hash, fees: tx.fees } : null;
    }
    if (endpoint.name === 'blockstream' || endpoint.name === 'mempool') {
      const txid = typeof response.data === 'string' ? response.data.trim() : null;
      return txid ? { txid } : null;
    }
    return null;
  } catch (error) {
    return null;
  }
};

const MOCK_TXID_PREFIX = 'dev_mock_tx_';
const FORCE_ERROR_HEX = 'FORCE_ERROR';

const generateMockTxid = (signedTxHex: string): string => {
  const truncatedHex = signedTxHex.slice(0, 8);
  const timestamp = Date.now().toString(16).slice(-8);
  return `${MOCK_TXID_PREFIX}${truncatedHex}_${timestamp}`;
};

export async function broadcastTransaction(signedTxHex: string): Promise<TransactionResponse> {
  const settings = walletManager.getSettings();
  
  if (settings.transactionDryRun) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (signedTxHex.includes(FORCE_ERROR_HEX)) {
      throw new Error('Simulated broadcast error for testing');
    }

    // Clear API cache after successful transaction
    clearApiCache();

    return {
      txid: generateMockTxid(signedTxHex),
      fees: 1000
    };
  }

  let lastError: Error | null = null;
  let errorMessage: string | null = null;
  
  for (const endpoint of broadcastEndpoints) {
    try {
      const url = await endpoint.getUrl(signedTxHex);
      // Use broadcast-specific timeout (45 seconds) with retry logic
      const response = await withRetry(
        () => apiClient.post(
          url,
          endpoint.getData(signedTxHex),
          { headers: endpoint.headers }
        ),
        2 // Only retry twice for broadcasts
      );
      if (response && response.status >= 200 && response.status < 300) {
        const formatted = formatResponse(endpoint, response);
        if (formatted && formatted.txid) {
          // Clear API cache after successful transaction
          clearApiCache();
          return formatted;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Extract the actual error message from the API response
      if (isApiError(error) && error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'string') {
          errorMessage = data;
        } else if (typeof data === 'object' && data !== null) {
          const dataObj = data as Record<string, unknown>;
          if (typeof dataObj.error === 'string') {
            errorMessage = dataObj.error;
          } else if (typeof dataObj.message === 'string') {
            errorMessage = dataObj.message;
          } else if (typeof dataObj.result === 'string') {
            errorMessage = dataObj.result;
          }
        }
      }
    }
  }
  
  // Throw the actual API error if we have one, otherwise the last error
  if (errorMessage) {
    throw new Error(errorMessage);
  }
  throw new Error(lastError?.message || 'Failed to broadcast transaction on all endpoints');
}
