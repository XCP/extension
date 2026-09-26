/**
 * Event Emitter Service
 *
 * Delivers typed events inside the background worker. The singleton carries wallet
 * events; tests can create independent instances with their own event contracts.
 * Provider notifications cross contexts through the background forwarding listener.
 * Listeners live in memory only and are never restored after a worker restart.
 */

import type { SignFlowEventPrefix, SignFlowResults } from '@/platform/provider/signFlow';

export interface ProviderEvents {
  accountsChanged: string[];
  disconnect: Record<string, never>;
}

export type ProviderEventPayload = {
  [K in keyof ProviderEvents]: { origin: string; event: K; data: ProviderEvents[K] }
}[keyof ProviderEvents];

type CompletedEvents = {
  [P in SignFlowEventPrefix as `${P}-complete-${string}`]: SignFlowResults[P extends 'sign-tx' ? 'sign-transaction' : P]
};
type CancelledEvents = { [K in `${SignFlowEventPrefix}-cancel-${string}`]: { reason: string } };

export type WalletEvents = CompletedEvents & CancelledEvents & {
  'emit-provider-event': ProviderEventPayload;
  'wallet-created': { walletId: string };
  'wallet-unlocked': Record<string, never>;
};

type EventCallback<T = unknown> = (data: T) => void | Promise<void>;

export class EventEmitterService<Events extends object> {
  private listeners = new Map<string, Set<EventCallback>>();

  /**
   * Register an event listener
   */
  on<K extends keyof Events & string>(event: K, callback: EventCallback<Events[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    // The heterogeneous map erases payload types only here; public registration and emission
    // agree through Events[K], including request-specific completion names.
    this.listeners.get(event)!.add(callback as EventCallback);
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof Events & string>(event: K, callback: EventCallback<Events[K]>): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    listeners.delete(callback as EventCallback);
    if (listeners.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emit an event to its listeners
   */
  emit<K extends keyof Events & string>(event: K, data: NoInfer<Events[K]>): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    listeners.forEach(callback => {
      this.invoke(callback, event, data);
    });
  }

  /** Event delivery is synchronous; asynchronous listener failures are observed independently. */
  private invoke(callback: EventCallback, event: string, data: unknown): void {
    const report = (error: unknown) => {
      console.error(`[EventEmitter] Error in event listener for ${event}:`, error);
    };
    try {
      const pending = callback(data);
      if (pending) pending.catch(report);
    } catch (error) {
      report(error);
    }
  }

  /**
   * Remove every listener
   */
  clear(): void {
    this.listeners.clear();
  }
}

// Export singleton instance
export const eventEmitterService = new EventEmitterService<WalletEvents>();

export type { EventCallback };
