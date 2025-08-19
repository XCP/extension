import axios, { AxiosResponse } from 'axios';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';

export interface TransactionResponse {
  txid: string;
  fees?: number;
}

interface BroadcastEndpoint {
  name: string;
  getUrl: (signedTxHex: string) => string | Promise<string>;
  getData: (signedTxHex: string) => any;
  headers: Record<string, string>;
}

const broadcastEndpoints: BroadcastEndpoint[] = [
  {
    name: 'counterparty',
    getUrl: async (signedTxHex: string) => {
      const settings = await getKeychainSettings();
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

const formatResponse = (endpoint: BroadcastEndpoint, response: AxiosResponse): TransactionResponse | null => {
  try {
    if (endpoint.name === 'counterparty') {
      const txid = response.data?.result;
      return txid ? { txid } : null;
    }
    if (endpoint.name === 'blockcypher') {
      const txid = response.data?.tx?.hash;
      return txid ? { txid, fees: response.data?.tx?.fees } : null;
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
  const settings = await getKeychainSettings();
  
  if (settings.transactionDryRun) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (signedTxHex.includes(FORCE_ERROR_HEX)) {
      throw new Error('Simulated broadcast error for testing');
    }

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
      const response = await axios.post(
        url,
        endpoint.getData(signedTxHex),
        { headers: endpoint.headers }
      );
      if (response.status >= 200 && response.status < 300) {
        const formatted = formatResponse(endpoint, response);
        if (formatted && formatted.txid) {
          return formatted;
        }
      }
    } catch (error) {
      lastError = error as Error;
      
      // Extract the actual error message from the API response
      if (axios.isAxiosError(error) && error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'string') {
          errorMessage = data;
        } else if (data.error) {
          errorMessage = data.error;
        } else if (data.message) {
          errorMessage = data.message;
        } else if (data.result) {
          errorMessage = data.result;
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
