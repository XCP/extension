/**
 * Storage for pending compose requests from dApps
 *
 * When a dApp calls xcp_composeSend, xcp_composeOrder, etc.,
 * we store the request parameters here so the popup can retrieve
 * them and pre-populate the compose forms.
 */

export interface ComposeRequest {
  id: string;
  type: 'send' | 'order' | 'dispenser' | 'issuance' | 'dividend';
  origin: string;
  params: any;
  timestamp: number;
}

class ComposeRequestStorage {
  private readonly STORAGE_KEY = 'pending_compose_requests';
  private readonly REQUEST_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Store a compose request
   */
  async store(request: ComposeRequest): Promise<void> {
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
   * Get a specific compose request by ID
   */
  async get(id: string): Promise<ComposeRequest | null> {
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
   * Get all valid compose requests
   */
  async getAll(): Promise<ComposeRequest[]> {
    const result = await chrome.storage.session.get(this.STORAGE_KEY);
    const requests = result[this.STORAGE_KEY] || [];

    // Filter out expired requests
    return requests.filter(
      (r: ComposeRequest) => Date.now() - r.timestamp < this.REQUEST_TTL
    );
  }

  /**
   * Get the most recent request of a specific type
   */
  async getLatestByType(type: ComposeRequest['type']): Promise<ComposeRequest | null> {
    const requests = await this.getAll();
    const typeRequests = requests
      .filter(r => r.type === type)
      .sort((a, b) => b.timestamp - a.timestamp);

    return typeRequests[0] || null;
  }

  /**
   * Remove a compose request
   */
  async remove(id: string): Promise<void> {
    const requests = await this.getAll();
    const filtered = requests.filter(r => r.id !== id);

    await chrome.storage.session.set({
      [this.STORAGE_KEY]: filtered
    });
  }

  /**
   * Clear all compose requests
   */
  async clear(): Promise<void> {
    await chrome.storage.session.set({
      [this.STORAGE_KEY]: []
    });
  }
}

export const composeRequestStorage = new ComposeRequestStorage();