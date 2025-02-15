import axios, { AxiosResponse } from 'axios';

export interface TransactionResponse {
  txid: string;
  fees?: number;
}

interface BroadcastEndpoint {
  name: string;
  getUrl: (signedTxHex: string) => string;
  getData: (signedTxHex: string) => any;
  headers: Record<string, string>;
}

const broadcastEndpoints: BroadcastEndpoint[] = [
  {
    name: 'counterparty',
    getUrl: (signedTxHex: string) => {
      const encoded = encodeURIComponent(signedTxHex);
      return `https://api.counterparty.io:4000/v2/bitcoin/transactions?signedhex=${encoded}`;
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

const formatResponse = (endpoint: BroadcastEndpoint, response: AxiosResponse): TransactionResponse => {
  if (endpoint.name === 'counterparty') {
    return { txid: response.data?.result };
  }
  if (endpoint.name === 'blockcypher') {
    return { txid: response.data?.tx?.hash, fees: response.data?.tx?.fees };
  }
  if (endpoint.name === 'blockstream' || endpoint.name === 'mempool') {
    return { txid: response.data?.trim() };
  }
  throw new Error('Unknown endpoint response format');
};

export async function broadcastTransaction(signedTxHex: string): Promise<TransactionResponse> {
  let lastError: Error | null = null;
  for (const endpoint of broadcastEndpoints) {
    try {
      const response = await axios.post(
        endpoint.getUrl(signedTxHex),
        endpoint.getData(signedTxHex),
        { headers: endpoint.headers }
      );
      if (response.status >= 200 && response.status < 300) {
        const formatted = formatResponse(endpoint, response);
        if (formatted.txid) {
          return formatted;
        }
      }
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw new Error(lastError?.message || 'Failed to broadcast transaction on all endpoints');
}
