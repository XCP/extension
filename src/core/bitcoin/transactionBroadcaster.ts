import { bytesToHex } from '@noble/hashes/utils.js';
import { API_TIMEOUTS, type ApiResponse, apiClient, isApiError } from '@/core/api/client';
import { clearBalanceCache } from '@/core/bitcoin/balance';
import { isAlreadyKnownError } from '@/core/bitcoin/broadcastErrors';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import { recordSpentUtxos } from '@/core/bitcoin/spentUtxoCache';
import { clearBitcoinCaches } from '@/core/bitcoin/utxo';
import { clearApiCache } from '@/core/counterparty/api';
import { getActiveSettings } from '@/core/settings';

export interface TransactionResponse {
  txid: string;
  fees?: number;
}

interface BroadcastEndpoint {
  name: 'counterparty' | 'blockstream' | 'mempool';
  getUrl: (signedTxHex: string) => string;
  /** The raw hex as a text body, or nothing when the hex rides in the URL. */
  getData: (signedTxHex: string) => string | null;
  headers: Record<string, string>;
}

/**
 * The node the wallet trusts for Counterparty state goes first, but its mempool is not the
 * network. A node that accepts a transaction and relays it nowhere leaves the user with a pending
 * entry no explorer can see, which is exactly what stranded a 38-asset MPMA send. So acceptance
 * anywhere is success, and the public relays are always fed afterwards as propagation insurance.
 * Both relays take the raw hex as a text body and answer with permissive CORS, so no host
 * permission is needed.
 *
 * BlockCypher is gone: its unauthenticated push endpoint rate-limits after a handful of calls,
 * and a 429 is never retried, so as a fallback it only delayed the next one.
 */
const broadcastEndpoints: BroadcastEndpoint[] = [
  {
    name: 'counterparty',
    getUrl: (signedTxHex: string) => {
      const settings = getActiveSettings();
      const encoded = encodeURIComponent(signedTxHex);
      return `${settings.counterpartyApiBase}/v2/bitcoin/transactions?signedhex=${encoded}`;
    },
    getData: () => null,
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

/** A slow relay must not hold up the wallet's answer once the transaction is accepted. */
const RELAY_FANOUT_TIMEOUT_MS = 10_000;

/** The txid an endpoint echoes back on acceptance; the wallet reports its own computed id. */
const echoedTxid = (endpoint: BroadcastEndpoint, response: ApiResponse): string | null => {
  try {
    if (endpoint.name === 'counterparty') {
      const data = response.data as Record<string, unknown> | undefined;
      const txid = data?.result;
      return typeof txid === 'string' && txid ? txid : null;
    }
    const txid = typeof response.data === 'string' ? response.data.trim() : null;
    return txid ? txid : null;
  } catch {
    return null;
  }
};

/** The most specific message an endpoint gave for turning the transaction down. */
function rejectionMessage(source: unknown): string | null {
  const data = isApiError(source)
    ? source.response?.data
    : source && typeof source === 'object' && 'data' in source
      ? (source as { data: unknown }).data
      : undefined;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['error', 'message', 'result']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string;
    }
  }
  return source instanceof Error && source.message ? source.message : null;
}

type Attempt =
  | { accepted: true; txid: string | null }
  | { accepted: false; message: string | null };

/**
 * One send to one endpoint, exactly once. A broadcast POST is not safe to repeat blindly: the
 * first attempt may have landed while its response was lost, and the node's answer to a repeat
 * is a rejection that reads as failure. The fan-out below is the only retry, and it is a fan-out
 * to other nodes, not a repeat against the same one.
 */
async function attempt(endpoint: BroadcastEndpoint, signedTxHex: string, timeout: number): Promise<Attempt> {
  try {
    const response = await apiClient.post(
      endpoint.getUrl(signedTxHex),
      endpoint.getData(signedTxHex),
      { headers: endpoint.headers, timeout, retries: 0 },
    );
    if (response && response.status >= 200 && response.status < 300) {
      const txid = echoedTxid(endpoint, response);
      if (txid) return { accepted: true, txid };
    }
    return { accepted: false, message: rejectionMessage(response) };
  } catch (error) {
    const message = rejectionMessage(error);
    // The node already holds these bytes: an earlier send landed. That is success.
    if (message && isAlreadyKnownError(message)) return { accepted: true, txid: null };
    return { accepted: false, message };
  }
}

/**
 * Compute a signed transaction's txid locally, so the value we report is the
 * real transaction id rather than whatever a broadcast endpoint echoes back.
 * Returns null if the hex can't be parsed.
 */
export function computeTxid(signedTxHex: string): string | null {
  try {
    const tx = parseTransactionForSigning(signedTxHex);
    return tx.id;
  } catch {
    return null;
  }
}

/**
 * Parse a signed transaction hex to extract its inputs (txid + vout pairs).
 * Used to record spent UTXOs after broadcast. Fails gracefully — returns
 * empty array if parsing fails so broadcast is never blocked.
 */
export function extractInputsFromRawTx(signedTxHex: string): { txid: string; vout: number }[] {
  try {
    const tx = parseTransactionForSigning(signedTxHex);
    const inputs: { txid: string; vout: number }[] = [];
    for (let i = 0; i < tx.inputsLength; i++) {
      const input = tx.getInput(i);
      if (input.txid) {
        // txid bytes are in internal (reversed) order; reverse for standard display format
        const txid = bytesToHex(Uint8Array.from(input.txid).reverse());
        inputs.push({ txid, vout: input.index ?? 0 });
      }
    }
    return inputs;
  } catch {
    return [];
  }
}

const MOCK_TXID_PREFIX = 'dev_mock_tx_';
const FORCE_ERROR_HEX = 'FORCE_ERROR';

const generateMockTxid = (signedTxHex: string): string => {
  const truncatedHex = signedTxHex.slice(0, 8);
  const timestamp = Date.now().toString(16).slice(-8);
  return `${MOCK_TXID_PREFIX}${truncatedHex}_${timestamp}`;
};

function settleLocalState(signedTxHex: string): void {
  // Clear all caches after successful transaction
  clearApiCache();
  clearBitcoinCaches();
  clearBalanceCache();
  recordSpentUtxos(extractInputsFromRawTx(signedTxHex));
}

export async function broadcastTransaction(signedTxHex: string): Promise<TransactionResponse> {
  const settings = getActiveSettings();

  if (settings.transactionDryRun) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (signedTxHex.includes(FORCE_ERROR_HEX)) {
      throw new Error('Simulated broadcast error for testing');
    }
    settleLocalState(signedTxHex);
    return {
      txid: generateMockTxid(signedTxHex),
      fees: 1000
    };
  }

  const localTxid = computeTxid(signedTxHex);
  const rejections: string[] = [];
  const tried = new Set<BroadcastEndpoint>();

  for (const endpoint of broadcastEndpoints) {
    tried.add(endpoint);
    const result = await attempt(endpoint, signedTxHex, API_TIMEOUTS.BROADCAST);
    if (!result.accepted) {
      if (result.message) rejections.push(result.message);
      continue;
    }

    // Accepted somewhere. Feed the public relays not yet asked, so the transaction sits in the
    // mempools explorers and miners actually read, not only in the one node that answered first.
    // Their verdicts do not change the outcome: a relay that already has it, or is down, is noise.
    await Promise.allSettled(
      broadcastEndpoints
        .filter(relay => !tried.has(relay) && relay.name !== 'counterparty')
        .map(relay => attempt(relay, signedTxHex, RELAY_FANOUT_TIMEOUT_MS)),
    );

    settleLocalState(signedTxHex);
    const txid = localTxid ?? result.txid;
    if (!txid) throw new Error('Transaction was accepted but its id could not be determined');
    return { txid };
  }

  throw new Error(rejections[0] ?? 'Failed to broadcast transaction on all endpoints');
}
