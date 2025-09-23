/**
 * MessageBus - Centralized message passing for extension contexts
 * 
 * Standardizes all cross-context communication on webext-bridge
 * Provides type-safe messaging with consistent error handling
 * 
 * Note: This is primarily used in the background script context
 */

import { 
  sendMessage as bridgeSendMessage, 
  onMessage as bridgeOnMessage 
} from 'webext-bridge/background';
import type { ProtocolWithReturn } from 'webext-bridge';

export type MessageTarget = 'background' | 'popup' | 'content-script' | 'devtools' | 'options';

export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: number;
    stack?: string;
  };
}

export interface ProviderMessageData {
  method: string;
  params?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ProviderMessage {
  type: 'PROVIDER_REQUEST';
  origin: string;
  data: ProviderMessageData;
  xcpWalletVersion: string;
  timestamp: number;
}

export interface EventMessage {
  type: 'PROVIDER_EVENT';
  event: string;
  data: unknown;
  origin?: string;
}

export interface ApprovalMessage {
  type: 'RESOLVE_PROVIDER_REQUEST';
  requestId: string;
  approved: boolean;
  updatedParams?: unknown;
}

interface WalletLockMessage {
  type: 'WALLET_LOCKED';
  locked: boolean;
}

// Define the protocol map for type safety
export interface MessageProtocol {
  // Wallet messages
  'walletLocked': ProtocolWithReturn<{ locked: boolean }, void>;
  
  // Provider messages  
  'provider-request': ProtocolWithReturn<ProviderMessage, MessageResponse>;
  'provider-event': ProtocolWithReturn<EventMessage, void>;
  'resolve-provider-request': ProtocolWithReturn<ApprovalMessage, { success: boolean }>;
  
  // Service health
  'service-health-check': ProtocolWithReturn<{ serviceNames?: string[] }, Record<string, unknown>>;
  
  // Generic message for unknown types
  [key: string]: any;
}

/**
 * Centralized message bus for all extension contexts
 */
export class MessageBus {
  private static readonly MESSAGE_TIMEOUT = 10000; // 10 seconds
  
  private static backgroundReady = false;
  private static readinessPromise: Promise<boolean> | null = null;
  
  /**
   * Check if background service worker is ready to receive messages
   */
  private static async ensureBackgroundReady(): Promise<boolean> {
    if (MessageBus.backgroundReady) {
      return true;
    }
    
    if (MessageBus.readinessPromise) {
      return MessageBus.readinessPromise;
    }
    
    MessageBus.readinessPromise = new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;
      
      const checkReady = async () => {
        try {
          // Try to ping the background
          const response = await bridgeSendMessage('startup-health-check', {}, 'background');
          if (response && typeof response === 'object' && 'status' in response && response.status === 'ready') {
            MessageBus.backgroundReady = true;
            resolve(true);
            return;
          }
        } catch (error) {
          // Background not ready yet
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          console.warn('Background service worker not ready after', maxAttempts, 'attempts');
          resolve(false);
        } else {
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms...
          const delay = Math.min(50 * Math.pow(2, attempts), 1000);
          setTimeout(checkReady, delay);
        }
      };
      
      checkReady();
    });
    
    return MessageBus.readinessPromise;
  }
  
  /**
   * Send a message to another extension context with background readiness check
   */
  static async send<K extends keyof MessageProtocol>(
    message: K,
    data: MessageProtocol[K]['input'],
    target: MessageTarget,
    options: {
      timeout?: number;
      retries?: number;
      skipReadinessCheck?: boolean;
      suppressTimeoutLog?: boolean;
    } = {}
  ): Promise<MessageProtocol[K]['output']> {
    const { timeout = MessageBus.MESSAGE_TIMEOUT, retries = 0, skipReadinessCheck = false, suppressTimeoutLog = false } = options;
    
    // Optional debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[MessageBus] Sending message:', message, 'to:', target);
    }
    
    // Ensure background is ready for background-targeted messages
    if (target === 'background' && !skipReadinessCheck) {
      const isReady = await MessageBus.ensureBackgroundReady();
      if (!isReady) {
        throw new Error('Background service worker not ready');
      }
    }
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await Promise.race([
          bridgeSendMessage(message as string, data, target),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Message timeout after ${timeout}ms`)), timeout);
          })
        ]);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (process.env.NODE_ENV === 'development') {
          // Don't log timeout errors if suppressTimeoutLog is true
          const isTimeout = errorMessage.includes('Message timeout');
          if (!suppressTimeoutLog || !isTimeout) {
            console.error('[MessageBus] Message failed:', message, 'to:', target, 'error:', errorMessage);
          }
        }
        
        if (attempt < retries) {
          console.warn(`Message attempt ${attempt + 1} failed, retrying...`, error);
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1))); // Exponential backoff
        }
      }
    }
    
    throw lastError || new Error('Message failed with unknown error');
  }
  
  /**
   * Send a message without expecting a response
   */
  static async sendOneWay<K extends keyof MessageProtocol>(
    message: K,
    data: MessageProtocol[K]['input'],
    target: MessageTarget
  ): Promise<void> {
    // For popup target, we need to handle the fact that the UI can run in multiple contexts:
    // - Popup window (chrome.extension.getViews({ type: 'popup' }))
    // - Tab (chrome.extension.getViews({ type: 'tab' }))
    // - Side panel (not detectable via getViews, opened via chrome.sidePanel API)
    //
    // Since we can't reliably detect all contexts, we'll attempt to send and handle
    // failures gracefully. This is the most robust approach.

    try {
      await MessageBus.send(message, data, target, {
        timeout: 5000,
        suppressTimeoutLog: true
      });
    } catch (error) {
      // With proper top-level listeners, most connection errors should be resolved
      // Only log truly unexpected errors now
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Suppress all timeout errors and handler registration errors for one-way messages
      // These are expected when the popup isn't ready yet, especially for
      // non-critical messages like walletLocked
      if (!errorMessage.includes('Message timeout') &&
          !errorMessage.includes('No handler registered')) {
        console.debug(`One-way message '${String(message)}' to ${target} failed:`, errorMessage);
      }

      // Don't throw - one-way messages should fail silently
    }
  }
  
  /**
   * Register a message handler
   */
  static onMessage<K extends keyof MessageProtocol>(
    message: K,
    handler: (data: MessageProtocol[K]['input']) => MessageProtocol[K]['output'] | Promise<MessageProtocol[K]['output']>
  ) {
    return bridgeOnMessage(message as string, async ({ data }: { data: any }) => {
      try {
        return await handler(data);
      } catch (error) {
        console.error(`Error in message handler for '${message}':`, error);
        throw error;
      }
    });
  }
  
  /**
   * Broadcast an event to all contexts
   */
  static async broadcastEvent(
    event: string,
    data: unknown,
    targets: MessageTarget[] = ['popup', 'content-script']
  ): Promise<void> {
    const promises = targets.map(target =>
      MessageBus.sendOneWay('provider-event', {
        type: 'PROVIDER_EVENT',
        event,
        data
      }, target)
    );
    
    await Promise.allSettled(promises);
  }
  
  /**
   * Send a provider request (from content script to background)
   */
  static async sendProviderRequest(
    origin: string,
    method: string,
    params: unknown[] = [],
    metadata?: Record<string, unknown>
  ): Promise<unknown> {
    const message: ProviderMessage = {
      type: 'PROVIDER_REQUEST',
      origin,
      data: {
        method,
        params,
        metadata
      },
      xcpWalletVersion: '2.0',
      timestamp: Date.now()
    };
    
    const response = await MessageBus.send('provider-request', message, 'background') as any;
    
    if (!response.success) {
      throw new Error(response.error?.message || 'Provider request failed');
    }
    
    return response.data;
  }
  
  /**
   * Send wallet lock notification
   */
  static async notifyWalletLocked(locked: boolean): Promise<void> {
    await MessageBus.sendOneWay('walletLocked', { locked }, 'popup');
  }
  
  /**
   * Resolve a provider approval request
   */
  static async resolveApprovalRequest(
    requestId: string,
    approved: boolean,
    updatedParams?: unknown
  ): Promise<void> {
    await MessageBus.send('resolve-provider-request', {
      type: 'RESOLVE_PROVIDER_REQUEST',
      requestId,
      approved,
      updatedParams
    }, 'background');
  }
  
  /**
   * Get health status of services
   */
  static async getServiceHealth(serviceNames?: string[]): Promise<Record<string, unknown>> {
    return MessageBus.send('service-health-check', { serviceNames }, 'background') as Promise<Record<string, unknown>>;
  }
}