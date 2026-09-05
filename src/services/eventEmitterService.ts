/**
 * Event Emitter Service
 *
 * Delivers typed events inside the background worker. The singleton carries wallet
 * events; tests can create independent instances with their own event contracts.
 * Provider notifications cross contexts through the background forwarding listener.
 * Callbacks and waiting callers are never restored after a worker restart.
 */

import type { SignFlowEventPrefix, SignFlowResults } from '@/platform/provider/signFlow';
import { BaseService } from '@/services/core/BaseService';

export interface ProviderEvents {
  accountsChanged: string[];
  disconnect: Record<string, never>;
}

export type ProviderEventPayload = {
  [K in keyof ProviderEvents]: { origin?: string; event: K; data: ProviderEvents[K] }
}[keyof ProviderEvents];

type CompletedEvents = {
  [P in SignFlowEventPrefix as `${P}-complete-${string}`]: SignFlowResults[P extends 'sign-tx' ? 'sign-transaction' : P]
};
type CancelledEvents = { [K in `${SignFlowEventPrefix}-cancel-${string}`]: { reason: string } };

export type WalletEvents = CompletedEvents & CancelledEvents & ProviderEvents & {
  'emit-provider-event': ProviderEventPayload;
  'wallet-created': { walletId: string };
  'wallet-unlocked': Record<string, never>;
  'pending-unlock-connection': { requestId: string; origin: string; method: 'xcp_requestAccounts' };
};

type EventCallback<T = unknown> = (data: T, origin?: string) => void | Promise<void>;
type PendingRequestResolver = (value: unknown) => void;

interface TimedListener {
  callback: EventCallback;
  registeredAt: number;
  timeoutMs: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

interface EventEmitterState {
  listeners: Map<string, Set<EventCallback>>;
  pendingRequests: Map<string, PendingRequestResolver>;
  timedListeners: Map<string, TimedListener[]>;
}

interface SerializedEventEmitterState {
  listenerKeys: string[];
  pendingRequestIds: string[];
}

export class EventEmitterService<Events extends object> extends BaseService {
  private state: EventEmitterState = {
    listeners: new Map(),
    pendingRequests: new Map(),
    timedListeners: new Map(),
  };

  private static readonly STATE_VERSION = 1;
  private static readonly DEFAULT_LISTENER_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  constructor() {
    super('EventEmitterService');
  }

  /**
   * Emit a provider event to a specific origin or all listeners
   */
  emitProviderEvent<K extends keyof Events & string>(origin: string | null, event: K, data: NoInfer<Events[K]>): void {
    const key = origin ? `${origin}:${event}` : event;
    const listeners = this.state.listeners.get(key);
    
    if (listeners) {
      listeners.forEach(callback => {
        this.invoke(callback, key, [data]);
      });
    }
    
    // Also emit to wildcard listeners if origin-specific
    if (origin) {
      const wildcardListeners = this.state.listeners.get(event);
      if (wildcardListeners) {
        wildcardListeners.forEach(callback => {
          this.invoke(callback, event, [data, origin]);
        });
      }
    }
  }

  /**
   * Register an event listener
   */
  on<K extends keyof Events & string>(event: K, callback: EventCallback<Events[K]>, origin?: string): void {
    const key = origin ? `${origin}:${event}` : event;
    
    if (!this.state.listeners.has(key)) {
      this.state.listeners.set(key, new Set());
    }
    
    // The heterogeneous map erases payload types only here; public registration and emission
    // agree through Events[K], including request-specific completion names.
    this.state.listeners.get(key)!.add(callback as EventCallback);
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof Events & string>(event: K, callback: EventCallback<Events[K]>, origin?: string): void {
    const key = origin ? `${origin}:${event}` : event;
    const listeners = this.state.listeners.get(key);

    if (listeners) {
      listeners.delete(callback as EventCallback);
      if (listeners.size === 0) {
        this.state.listeners.delete(key);
      }
    }

    // Also clean up from timed listeners
    this.removeTimedListener(key, callback as EventCallback);
  }

  /**
   * Register an event listener with automatic timeout cleanup
   * Use this for single-use dynamic event keys to prevent memory leaks
   */
  onWithTimeout<K extends keyof Events & string>(
    event: K,
    callback: EventCallback<Events[K]>,
    timeoutMs: number = EventEmitterService.DEFAULT_LISTENER_TIMEOUT
  ): void {
    // Register normally
    this.on(event, callback);

    // Track for timeout cleanup
    const timedListener: TimedListener = {
      callback: callback as EventCallback,
      registeredAt: Date.now(),
      timeoutMs,
    };

    // Set up auto-cleanup timeout
    timedListener.timeoutId = setTimeout(() => {
      this.off(event, callback);
      console.debug(`[EventEmitter] Auto-cleaned timed listener for: ${event}`);
    }, timeoutMs);

    // Store in timed listeners map
    if (!this.state.timedListeners.has(event)) {
      this.state.timedListeners.set(event, []);
    }
    this.state.timedListeners.get(event)!.push(timedListener);
  }

  /**
   * Remove a timed listener and clear its timeout
   */
  private removeTimedListener(event: string, callback: EventCallback): void {
    const timedListeners = this.state.timedListeners.get(event);
    if (!timedListeners) return;

    const index = timedListeners.findIndex(tl => tl.callback === callback);
    if (index !== -1) {
      const [removed] = timedListeners.splice(index, 1);
      if (removed!.timeoutId) {
        clearTimeout(removed!.timeoutId);
      }
    }

    // Clean up empty array
    if (timedListeners.length === 0) {
      this.state.timedListeners.delete(event);
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
  resolvePendingRequest(id: string, value: unknown): boolean {
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
  emit<K extends keyof Events & string>(event: K, data: NoInfer<Events[K]>): void {
    const listeners = this.state.listeners.get(event);
    
    if (listeners) {
      listeners.forEach(callback => {
        this.invoke(callback, event, [data]);
      });
    }
  }

  /** Event delivery is synchronous; asynchronous listener failures are observed independently. */
  private invoke(callback: EventCallback, event: string, args: [unknown, string?]): void {
    const report = (error: unknown) => {
      console.error(`[EventEmitter] Error in event listener for ${event}:`, error);
    };
    try {
      const pending = callback(...args);
      if (pending) pending.catch(report);
    } catch (error) {
      report(error);
    }
  }

  /**
   * Clear all listeners and pending requests
   */
  clear(): void {
    this.state.listeners.clear();
    this.state.pendingRequests.clear();

    // Clear all timed listener timeouts
    for (const timedListeners of this.state.timedListeners.values()) {
      for (const tl of timedListeners) {
        if (tl.timeoutId) {
          clearTimeout(tl.timeoutId);
        }
      }
    }
    this.state.timedListeners.clear();
  }

  // BaseService implementation methods

  protected async onInitialize(): Promise<void> {
    // No specific initialization needed
    console.log('[EventEmitter] Initialized');
  }

  protected async onDestroy(): Promise<void> {
    // Clear all state on destroy
    this.clear();
    console.log('[EventEmitter] Destroyed');
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

  protected hydrateState(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const state = value as Record<string, unknown>;
    if (!Array.isArray(state.listenerKeys) || !state.listenerKeys.every(key => typeof key === 'string') ||
        !Array.isArray(state.pendingRequestIds) || !state.pendingRequestIds.every(id => typeof id === 'string')) return;
    // We can't restore actual callbacks, but we can log what was previously registered
    // This helps with debugging service worker restarts
    if (state.listenerKeys.length > 0) {
      console.log('[EventEmitter] Previous listener keys:', state.listenerKeys);
      console.log('[EventEmitter] Note: Listeners must re-register after service worker restart');
    }
    
    if (state.pendingRequestIds.length > 0) {
      console.warn('[EventEmitter] Pending requests lost during restart:', state.pendingRequestIds);
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
    timedListenerCount: number;
    listenersByEvent: Record<string, number>;
  } {
    const listenersByEvent: Record<string, number> = {};

    for (const [key, listeners] of Array.from(this.state.listeners)) {
      listenersByEvent[key] = listeners.size;
    }

    // Count total timed listeners
    let timedListenerCount = 0;
    for (const timedListeners of this.state.timedListeners.values()) {
      timedListenerCount += timedListeners.length;
    }

    return {
      listenerCount: this.state.listeners.size,
      pendingRequestCount: this.state.pendingRequests.size,
      timedListenerCount,
      listenersByEvent,
    };
  }
}

// Export singleton instance
export const eventEmitterService = new EventEmitterService<WalletEvents>();

// Export types for consumers
export type { EventCallback, PendingRequestResolver };
