/**
 * Event Emitter Service
 * Provides a centralized, type-safe event system for cross-context communication
 * Replaces unsafe global variable usage
 * 
 * Now extends BaseService for state persistence across service worker restarts
 */

import { BaseService } from './core/BaseService';

type EventCallback = (...args: unknown[]) => void;
type PendingRequestResolver = (value: unknown) => void;

interface EventEmitterState {
  listeners: Map<string, Set<EventCallback>>;
  pendingRequests: Map<string, PendingRequestResolver>;
}

interface SerializedEventEmitterState {
  listenerKeys: string[];
  pendingRequestIds: string[];
}

class EventEmitterService extends BaseService {
  private state: EventEmitterState = {
    listeners: new Map(),
    pendingRequests: new Map(),
  };
  
  private static readonly STATE_VERSION = 1;

  constructor() {
    super('EventEmitterService');
  }

  /**
   * Emit a provider event to a specific origin or all listeners
   */
  emitProviderEvent(origin: string | null, event: string, data: unknown): void {
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

  // BaseService implementation methods

  protected async onInitialize(): Promise<void> {
    // No specific initialization needed
    console.log('EventEmitterService initialized');
  }

  protected async onDestroy(): Promise<void> {
    // Clear all state on destroy
    this.clear();
    console.log('EventEmitterService destroyed');
  }

  protected getSerializableState(): SerializedEventEmitterState | null {
    // We only persist the keys, not the actual callbacks
    // Listeners will need to re-register after service worker restart
    if (this.state.listeners.size === 0 && this.state.pendingRequests.size === 0) {
      return null;
    }

    return {
      listenerKeys: Array.from(this.state.listeners.keys()),
      pendingRequestIds: Array.from(this.state.pendingRequests.keys()),
    };
  }

  protected hydrateState(state: SerializedEventEmitterState): void {
    // We can't restore actual callbacks, but we can log what was previously registered
    // This helps with debugging service worker restarts
    if (state.listenerKeys.length > 0) {
      console.log('EventEmitterService: Previous listener keys:', state.listenerKeys);
      console.log('Note: Listeners must re-register after service worker restart');
    }
    
    if (state.pendingRequestIds.length > 0) {
      console.warn('EventEmitterService: Pending requests lost during restart:', state.pendingRequestIds);
      // These requests are now orphaned and will need to timeout on their own
    }
  }

  protected getStateVersion(): number {
    return EventEmitterService.STATE_VERSION;
  }

  /**
   * Get statistics about the current state
   */
  getStats(): {
    listenerCount: number;
    pendingRequestCount: number;
    listenersByEvent: Record<string, number>;
  } {
    const listenersByEvent: Record<string, number> = {};
    
    for (const [key, listeners] of Array.from(this.state.listeners)) {
      listenersByEvent[key] = listeners.size;
    }
    
    return {
      listenerCount: this.state.listeners.size,
      pendingRequestCount: this.state.pendingRequests.size,
      listenersByEvent,
    };
  }
}

// Export singleton instance
export const eventEmitterService = new EventEmitterService();

// Export types for consumers
export type { EventCallback, PendingRequestResolver };