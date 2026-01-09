/**
 * Storage for pending raw transaction signing requests from dApps
 *
 * When a dApp calls xcp_signTransaction, we store the request parameters
 * here so the popup can retrieve them and show the approval UI.
 */

export interface SignTransactionRequest {
  id: string;
  origin: string;
  rawTxHex: string;
  timestamp: number;
}

class SignTransactionRequestStorage {
  private readonly STORAGE_KEY = 'pending_sign_transaction_requests';
  private readonly REQUEST_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Store a sign transaction request
   */
  async store(request: SignTransactionRequest): Promise<void> {
    const requests = await this.getAll();
    requests.push(request);

    // Clean up old requests while we're at it
    const validRequests = requests.filter(
      r => Date.now() - r.timestamp < this.REQUEST_TTL
    );

    await chrome.storage.session.set({
      [this.STORAGE_KEY]: validRequests
    });
  }

  /**
   * Get a specific sign transaction request by ID
   */
  async get(id: string): Promise<SignTransactionRequest | null> {
    const requests = await this.getAll();
    const request = requests.find(r => r.id === id);

    if (!request) return null;

    // Check if expired
    if (Date.now() - request.timestamp >= this.REQUEST_TTL) {
      await this.remove(id);
      return null;
    }

    return request;
  }

  /**
   * Get all valid sign transaction requests
   */
  async getAll(): Promise<SignTransactionRequest[]> {
    const result = await chrome.storage.session.get(this.STORAGE_KEY);
    const requests = (result[this.STORAGE_KEY] as SignTransactionRequest[] | undefined) || [];

    // Filter out expired requests
    return requests.filter(
      (r: SignTransactionRequest) => Date.now() - r.timestamp < this.REQUEST_TTL
    );
  }

  /**
   * Remove a sign transaction request
   */
  async remove(id: string): Promise<void> {
    const requests = await this.getAll();
    const filtered = requests.filter(r => r.id !== id);

    await chrome.storage.session.set({
      [this.STORAGE_KEY]: filtered
    });
  }

  /**
   * Clear all sign transaction requests
   */
  async clear(): Promise<void> {
    await chrome.storage.session.set({
      [this.STORAGE_KEY]: []
    });
  }
}

export const signTransactionRequestStorage = new SignTransactionRequestStorage();
