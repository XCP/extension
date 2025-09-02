/**
 * Event Emitter Service
 * Provides a centralized, type-safe event system for cross-context communication
 * Replaces unsafe global variable usage
 */

type EventCallback = (...args: any[]) => void;
type PendingRequestResolver = (value: any) => void;

interface EventEmitterState {
  listeners: Map<string, Set<EventCallback>>;
  pendingRequests: Map<string, PendingRequestResolver>;
}

class EventEmitterService {
  private state: EventEmitterState = {
    listeners: new Map(),
    pendingRequests: new Map(),
  };

  /**
   * Emit a provider event to a specific origin or all listeners
   */
  emitProviderEvent(origin: string | null, event: string, data: any): void {
    const key = origin ? `${origin}:${event}` : event;
    const listeners = this.state.listeners.get(key);
    
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${key}:`, error);
        }
      });
    }
    
    // Also emit to wildcard listeners if origin-specific
    if (origin) {
      const wildcardListeners = this.state.listeners.get(event);
      if (wildcardListeners) {
        wildcardListeners.forEach(callback => {
          try {
            callback(data, origin);
          } catch (error) {
            console.error(`Error in wildcard listener for ${event}:`, error);
          }
        });
      }
    }
  }

  /**
   * Register an event listener
   */
  on(event: string, callback: EventCallback, origin?: string): void {
    const key = origin ? `${origin}:${event}` : event;
    
    if (!this.state.listeners.has(key)) {
      this.state.listeners.set(key, new Set());
    }
    
    this.state.listeners.get(key)!.add(callback);
  }

  /**
   * Remove an event listener
   */
  off(event: string, callback: EventCallback, origin?: string): void {
    const key = origin ? `${origin}:${event}` : event;
    const listeners = this.state.listeners.get(key);
    
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.state.listeners.delete(key);
      }
    }
  }

  /**
   * Store a pending request resolver
   */
  setPendingRequest(id: string, resolver: PendingRequestResolver): void {
    this.state.pendingRequests.set(id, resolver);
  }

  /**
   * Resolve a pending request
   */
  resolvePendingRequest(id: string, value: any): boolean {
    const resolver = this.state.pendingRequests.get(id);
    
    if (resolver) {
      this.state.pendingRequests.delete(id);
      resolver(value);
      return true;
    }
    
    return false;
  }

  /**
   * Clear a pending request without resolving
   */
  clearPendingRequest(id: string): void {
    this.state.pendingRequests.delete(id);
  }

  /**
   * Get the count of pending requests (for debugging)
   */
  getPendingRequestCount(): number {
    return this.state.pendingRequests.size;
  }

  /**
   * Emit a general event (not provider-specific)
   */
  emit(event: string, data: any): void {
    const listeners = this.state.listeners.get(event);
    
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clear all listeners and pending requests
   */
  clear(): void {
    this.state.listeners.clear();
    this.state.pendingRequests.clear();
  }
}

// Export singleton instance
export const eventEmitterService = new EventEmitterService();

// Export types for consumers
export type { EventCallback, PendingRequestResolver };