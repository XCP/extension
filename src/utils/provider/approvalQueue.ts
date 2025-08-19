/**
 * Manages queued approval requests from dApps
 */

export interface ApprovalRequest {
  id: string;
  origin: string;
  method: string;
  params: any;
  timestamp: number;
  type: 'connection' | 'transaction' | 'compose' | 'signature';
  metadata?: {
    domain?: string;
    title?: string;
    description?: string;
    warning?: boolean;
  };
}

class ApprovalQueueManager {
  private queue: ApprovalRequest[] = [];
  private currentWindowId: number | null = null;
  private listeners: Set<(queue: ApprovalRequest[]) => void> = new Set();

  /**
   * Add a request to the queue
   */
  add(request: Omit<ApprovalRequest, 'timestamp'>): void {
    const fullRequest: ApprovalRequest = {
      ...request,
      timestamp: Date.now()
    };
    
    this.queue.push(fullRequest);
    this.notifyListeners();
  }

  /**
   * Get all pending requests
   */
  getAll(): ApprovalRequest[] {
    return [...this.queue];
  }

  /**
   * Get the next request in queue
   */
  getNext(): ApprovalRequest | null {
    return this.queue[0] || null;
  }

  /**
   * Get a specific request by ID
   */
  get(id: string): ApprovalRequest | undefined {
    return this.queue.find(req => req.id === id);
  }

  /**
   * Remove a request from the queue
   */
  remove(id: string): boolean {
    const index = this.queue.findIndex(req => req.id === id);
    if (index > -1) {
      this.queue.splice(index, 1);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Clear all requests from a specific origin
   */
  clearByOrigin(origin: string): number {
    const originalLength = this.queue.length;
    this.queue = this.queue.filter(req => req.origin !== origin);
    const removed = originalLength - this.queue.length;
    if (removed > 0) {
      this.notifyListeners();
    }
    return removed;
  }

  /**
   * Clear all requests
   */
  clearAll(): void {
    this.queue = [];
    this.notifyListeners();
  }

  /**
   * Get count of pending requests
   */
  getCount(): number {
    return this.queue.length;
  }

  /**
   * Get count by type
   */
  getCountByType(type: ApprovalRequest['type']): number {
    return this.queue.filter(req => req.type === type).length;
  }

  /**
   * Check if there are pending requests from an origin
   */
  hasPendingFromOrigin(origin: string): boolean {
    return this.queue.some(req => req.origin === origin);
  }

  /**
   * Set the current approval window ID
   */
  setCurrentWindow(windowId: number | null): void {
    this.currentWindowId = windowId;
  }

  /**
   * Get the current approval window ID
   */
  getCurrentWindow(): number | null {
    return this.currentWindowId;
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: (queue: ApprovalRequest[]) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of queue changes
   */
  private notifyListeners(): void {
    const queue = this.getAll();
    this.listeners.forEach(listener => {
      try {
        listener(queue);
      } catch (error) {
        console.error('Error in approval queue listener:', error);
      }
    });
  }

  /**
   * Get requests grouped by origin
   */
  getGroupedByOrigin(): Map<string, ApprovalRequest[]> {
    const grouped = new Map<string, ApprovalRequest[]>();
    
    for (const request of this.queue) {
      const existing = grouped.get(request.origin) || [];
      existing.push(request);
      grouped.set(request.origin, existing);
    }
    
    return grouped;
  }

  /**
   * Reorder queue (move request to different position)
   */
  reorder(id: string, newIndex: number): boolean {
    const currentIndex = this.queue.findIndex(req => req.id === id);
    if (currentIndex === -1 || newIndex < 0 || newIndex >= this.queue.length) {
      return false;
    }

    const [request] = this.queue.splice(currentIndex, 1);
    this.queue.splice(newIndex, 0, request);
    this.notifyListeners();
    return true;
  }

  /**
   * Get expired requests (older than specified time)
   */
  getExpired(maxAgeMs: number = 5 * 60 * 1000): ApprovalRequest[] {
    const now = Date.now();
    return this.queue.filter(req => now - req.timestamp > maxAgeMs);
  }

  /**
   * Remove expired requests
   */
  removeExpired(maxAgeMs: number = 5 * 60 * 1000): number {
    const expired = this.getExpired(maxAgeMs);
    expired.forEach(req => this.remove(req.id));
    return expired.length;
  }
}

// Export singleton instance
export const approvalQueue = new ApprovalQueueManager();

// Also export for background script to track badge
export function getApprovalBadgeText(): string {
  const count = approvalQueue.getCount();
  if (count === 0) return '';
  if (count > 99) return '99+';
  return count.toString();
}