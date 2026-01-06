/**
 * Storage for pending sign message requests from dApps
 *
 * When a dApp calls xcp_signMessage, we store the request parameters
 * here so the popup can retrieve them and pre-populate the sign message form.
 */

export interface SignMessageRequest {
  id: string;
  origin: string;
  message: string;
  timestamp: number;
}

class SignMessageRequestStorage {
  private readonly STORAGE_KEY = 'pending_sign_message_requests';
  private readonly REQUEST_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Store a sign message request
   */
  async store(request: SignMessageRequest): Promise<void> {
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
   * Get a specific sign message request by ID
   */
  async get(id: string): Promise<SignMessageRequest | null> {
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
   * Get all valid sign message requests
   */
  async getAll(): Promise<SignMessageRequest[]> {
    const result = await chrome.storage.session.get(this.STORAGE_KEY);
    const requests = (result[this.STORAGE_KEY] as SignMessageRequest[] | undefined) || [];

    // Filter out expired requests
    return requests.filter(
      (r: SignMessageRequest) => Date.now() - r.timestamp < this.REQUEST_TTL
    );
  }

  /**
   * Remove a sign message request
   */
  async remove(id: string): Promise<void> {
    const requests = await this.getAll();
    const filtered = requests.filter(r => r.id !== id);

    await chrome.storage.session.set({
      [this.STORAGE_KEY]: filtered
    });
  }

  /**
   * Clear all sign message requests
   */
  async clear(): Promise<void> {
    await chrome.storage.session.set({
      [this.STORAGE_KEY]: []
    });
  }
}

export const signMessageRequestStorage = new SignMessageRequestStorage();