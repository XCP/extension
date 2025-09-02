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
  params?: any[];
  metadata?: Record<string, any>;
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
  data: any;
  origin?: string;
}

export interface ApprovalMessage {
  type: 'RESOLVE_PROVIDER_REQUEST';
  requestId: string;
  approved: boolean;
  updatedParams?: any;
}

export interface WalletLockMessage {
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
  'service-health-check': ProtocolWithReturn<{ serviceNames?: string[] }, Record<string, any>>;
  
  // Generic message for unknown types
  [key: string]: any;
}

/**
 * Centralized message bus for all extension contexts
 */
export class MessageBus {
  private static readonly MESSAGE_TIMEOUT = 10000; // 10 seconds
  
  /**
   * Send a message to another extension context
   */
  static async send<K extends keyof MessageProtocol>(
    message: K,
    data: MessageProtocol[K]['input'],
    target: MessageTarget,
    options: {
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<MessageProtocol[K]['output']> {
    const { timeout = MessageBus.MESSAGE_TIMEOUT, retries = 0 } = options;
    
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
    try {
      await MessageBus.send(message, data, target, { timeout: 5000 });
    } catch (error) {
      // Log but don't throw for one-way messages
      console.warn(`One-way message '${message}' failed:`, error);
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
    data: any,
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
    params: any[] = [],
    metadata?: Record<string, any>
  ): Promise<any> {
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
    updatedParams?: any
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
  static async getServiceHealth(serviceNames?: string[]): Promise<Record<string, any>> {
    return MessageBus.send('service-health-check', { serviceNames }, 'background') as Promise<Record<string, any>>;
  }
}