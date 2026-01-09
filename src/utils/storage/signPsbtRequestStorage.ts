/**
 * Storage for pending PSBT signing requests from dApps
 *
 * When a dApp calls xcp_signPsbt, we store the request parameters
 * here so the popup can retrieve them and show the approval UI.
 */

export interface SignPsbtRequest {
  id: string;
  origin: string;
  psbtHex: string;
  signInputs?: Record<string, number[]>;
  sighashTypes?: number[];
  timestamp: number;
}

class SignPsbtRequestStorage {
  private readonly STORAGE_KEY = 'pending_sign_psbt_requests';
  private readonly REQUEST_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Store a sign PSBT request
   */
  async store(request: SignPsbtRequest): Promise<void> {
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
   * Get a specific sign PSBT request by ID
   */
  async get(id: string): Promise<SignPsbtRequest | null> {
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
   * Get all valid sign PSBT requests
   */
  async getAll(): Promise<SignPsbtRequest[]> {
    const result = await chrome.storage.session.get(this.STORAGE_KEY);
    const requests = (result[this.STORAGE_KEY] as SignPsbtRequest[] | undefined) || [];

    // Filter out expired requests
    return requests.filter(
      (r: SignPsbtRequest) => Date.now() - r.timestamp < this.REQUEST_TTL
    );
  }

  /**
   * Remove a sign PSBT request
   */
  async remove(id: string): Promise<void> {
    const requests = await this.getAll();
    const filtered = requests.filter(r => r.id !== id);

    await chrome.storage.session.set({
      [this.STORAGE_KEY]: filtered
    });
  }

  /**
   * Clear all sign PSBT requests
   */
  async clear(): Promise<void> {
    await chrome.storage.session.set({
      [this.STORAGE_KEY]: []
    });
  }
}

export const signPsbtRequestStorage = new SignPsbtRequestStorage();
