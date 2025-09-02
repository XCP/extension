/**
 * RequestManager - Memory-safe management of pending async requests
 * 
 * Solves the memory leak issue in ProviderService where pending
 * requests could accumulate indefinitely without cleanup.
 */

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timestamp: number;
  origin?: string;
  method?: string;
  metadata?: Record<string, any>;
}

export class RequestManager {
  private requests = new Map<string, PendingRequest>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly timeoutMs: number;
  private readonly cleanupIntervalMs: number;

  constructor(
    timeoutMs: number = 300000, // 5 minutes default
    cleanupIntervalMs: number = 60000 // 1 minute default
  ) {
    this.timeoutMs = timeoutMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.startCleanupInterval();
  }

  /**
   * Add a new pending request
   */
  add(
    id: string,
    resolve: (value: any) => void,
    reject: (reason: any) => void,
    metadata?: Partial<PendingRequest>
  ): void {
    if (this.requests.has(id)) {
      console.warn(`Request ${id} already exists, replacing with new request`);
    }

    this.requests.set(id, {
      resolve,
      reject,
      timestamp: Date.now(),
      origin: metadata?.origin,
      method: metadata?.method,
      metadata: metadata?.metadata,
    });
  }

  /**
   * Resolve a pending request
   */
  resolve(id: string, value: any): boolean {
    const request = this.requests.get(id);
    if (request) {
      this.requests.delete(id);
      request.resolve(value);
      return true;
    }
    return false;
  }

  /**
   * Reject a pending request
   */
  reject(id: string, reason: any): boolean {
    const request = this.requests.get(id);
    if (request) {
      this.requests.delete(id);
      request.reject(reason);
      return true;
    }
    return false;
  }

  /**
   * Get a pending request without removing it
   */
  get(id: string): PendingRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Check if a request exists
   */
  has(id: string): boolean {
    return this.requests.has(id);
  }

  /**
   * Remove a request without resolving/rejecting
   */
  remove(id: string): boolean {
    return this.requests.delete(id);
  }

  /**
   * Get the number of pending requests
   */
  size(): number {
    return this.requests.size;
  }

  /**
   * Get all request IDs
   */
  getIds(): string[] {
    return Array.from(this.requests.keys());
  }

  /**
   * Get requests filtered by origin
   */
  getByOrigin(origin: string): Map<string, PendingRequest> {
    const filtered = new Map<string, PendingRequest>();
    for (const [id, request] of Array.from(this.requests)) {
      if (request.origin === origin) {
        filtered.set(id, request);
      }
    }
    return filtered;
  }

  /**
   * Clean up expired requests
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, request] of Array.from(this.requests)) {
      if (now - request.timestamp > this.timeoutMs) {
        this.requests.delete(id);
        request.reject(new Error(`Request timeout after ${this.timeoutMs}ms`));
        cleaned++;
        
        console.debug(`Request ${id} timed out`, {
          origin: request.origin,
          method: request.method,
          age: now - request.timestamp,
        });
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired requests`);
    }

    return cleaned;
  }

  /**
   * Clear all requests with optional rejection
   */
  clear(rejectAll: boolean = false, reason?: string): void {
    if (rejectAll) {
      const error = new Error(reason || 'All requests cleared');
      for (const request of Array.from(this.requests.values())) {
        request.reject(error);
      }
    }
    this.requests.clear();
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupIntervalMs);

    // Ensure interval doesn't prevent process termination
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Destroy the manager and clean up resources
   */
  destroy(): void {
    this.stopCleanupInterval();
    this.clear(true, 'RequestManager destroyed');
  }

  /**
   * Get statistics about pending requests
   */
  getStats(): {
    total: number;
    byOrigin: Record<string, number>;
    byMethod: Record<string, number>;
    oldest: number | null;
    newest: number | null;
  } {
    const now = Date.now();
    const byOrigin: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const request of Array.from(this.requests.values())) {
      // Count by origin
      if (request.origin) {
        byOrigin[request.origin] = (byOrigin[request.origin] || 0) + 1;
      }

      // Count by method
      if (request.method) {
        byMethod[request.method] = (byMethod[request.method] || 0) + 1;
      }

      // Track oldest and newest
      const age = now - request.timestamp;
      if (oldest === null || age > oldest) {
        oldest = age;
      }
      if (newest === null || age < newest) {
        newest = age;
      }
    }

    return {
      total: this.requests.size,
      byOrigin,
      byMethod,
      oldest,
      newest,
    };
  }

  /**
   * Create a promise that will be managed by this RequestManager
   */
  createManagedPromise<T>(
    id: string,
    metadata?: Partial<PendingRequest>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.add(id, resolve, reject, metadata);
    });
  }
}