import { registerWalletService, getWalletService } from '@/services/walletService';
import { registerProviderService, getProviderService } from '@/services/providerService';
import { registerConnectionService } from '@/services/connection';
import { registerApprovalService } from '@/services/approval';
import { eventEmitterService } from '@/services/eventEmitterService';
import { ServiceRegistry } from '@/services/core/ServiceRegistry';
import { MessageBus, type ProviderMessage, type ApprovalMessage, type EventMessage } from '@/services/core/MessageBus';
import { checkSessionRecovery, SessionRecoveryState } from '@/utils/auth/sessionManager';
import { JSON_RPC_ERROR_CODES, PROVIDER_ERROR_CODES, createJsonRpcError } from '@/utils/errors';
import { checkForLastError, wrapRuntimeCallback, broadcastToTabs, sendMessageToTab } from '@/utils/browser';
import { getUpdateService } from '@/services/updateService';
import { getPopupMonitorService } from '@/services/popupMonitorService';
// Import onMessage directly from webext-bridge/background to prevent runtime.lastError
import { onMessage as webextBridgeOnMessage } from 'webext-bridge/background';

// Track which tabs have content scripts ready
const readyTabs = new Set<number>();

// Export for use in browser.ts
export function isTabReady(tabId: number): boolean {
  return readyTabs.has(tabId);
}

export default defineBackground(() => {
  /**
   * CRITICAL: Chrome Runtime Error Prevention
   *
   * Chrome fires connection attempts immediately when the extension loads/updates,
   * often before our service worker is fully initialized. If these errors aren't
   * consumed, Chrome logs "Unchecked runtime.lastError" warnings to the console.
   *
   * These listeners MUST be the first thing registered to consume errors immediately.
   * They run synchronously before any async operations or other initialization.
   */

  // Primary error consumer for message-based connections
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Immediately check and consume lastError to prevent console warnings
    if (chrome.runtime.lastError) {
      // Error consumed - prevents "Unchecked runtime.lastError" spam
      // Common during extension startup when Chrome tries to reconnect to tabs
    }

    // Track content script readiness
    if (message && message.__xcp_cs_ready && sender.tab?.id) {
      readyTabs.add(sender.tab.id);
      console.log(`[Background] Content script ready on tab ${sender.tab.id}:`, message.tabUrl);
      // Don't respond - this is just a signal
      return false;
    }

    // DON'T respond - let the actual handlers do their job
    // Just consuming the error is enough
    return false; // Let other handlers process the message
  });

  // Secondary error consumer for port-based connections
  chrome.runtime.onConnect.addListener((port) => {
    // Check for connection errors immediately
    if (chrome.runtime.lastError) {
      // Error consumed - handles port connection failures
    }

    port.onDisconnect.addListener(() => {
      // Consume disconnect errors
      if (chrome.runtime.lastError) {
        // Error consumed - handles port disconnection issues
      }
    });
  });

  // Now set up the actual message handlers with proper logic
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Debug logging in development only
    if (process.env.NODE_ENV === 'development') {
      const messageType = message?.type || message?.action || (message?.serviceName ? `${message.serviceName}.${message.methodName}` : 'unknown');
      console.log('[Background] Received message:', messageType, 'from:', sender.tab?.url || sender.url || 'extension');
    }

    // Handle ping requests immediately
    if (message?.action === 'ping' || message?.type === 'startup-health-check') {
      sendResponse({ status: 'ready', timestamp: Date.now(), context: 'background' });
      return true;
    }

    // Handle compose events from popup (cross-context event emission)
    if (message?.type === 'COMPOSE_EVENT') {
      const { event, data } = message;
      if (event) {
        eventEmitterService.emit(event, data);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Event name required' });
      }
      return true;
    }

    // Check for lastError to prevent console warnings
    if (chrome.runtime.lastError) {
      // Error already "checked" by accessing it
    }

    // Let other handlers process the message
    return false;
  });
  
  console.log('[Background] Core message listener registered');

  // Track tab lifecycle - remove from ready set when tabs navigate or close
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      // Tab is navigating, content script will reload
      readyTabs.delete(tabId);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    // Tab closed, remove from ready set
    readyTabs.delete(tabId);
  });

  // Clear ready tabs on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    readyTabs.clear();
    console.log('[Background] Extension installed/updated - cleared ready tabs');
  });

  // Set up connection listener
  chrome.runtime.onConnect.addListener((port) => {
    port.onMessage.addListener((msg) => {
      if (msg?.action === 'ping') {
        port.postMessage({ status: 'ready', timestamp: Date.now() });
      }
    });
    
    port.onDisconnect.addListener(() => {
      // Check lastError to prevent warnings
      if (chrome.runtime.lastError) {
        // Error acknowledged
      }
    });
  });
  
  console.log('Background service worker: Core listeners registered');
  // Initialize webext-bridge handlers at top level of defineBackground
  // This ensures they're registered when the service worker starts
  webextBridgeOnMessage('webext-bridge-keep-alive', () => {
    return { alive: true };
  });
  
  webextBridgeOnMessage('startup-health-check', () => {
    return { 
      status: 'ready', 
      timestamp: Date.now(),
      services: 'ready'
    };
  });
  
  console.log('Background: webext-bridge handlers registered');
  
  // Using robust messaging utilities with ping-inject-retry pattern
  
  // Initialize service registry
  const serviceRegistry = ServiceRegistry.getInstance();
  
  // Initialize core services (non-blocking)
  serviceRegistry.register(eventEmitterService)
    .then(() => {
      console.log('Core services initialized');
    })
    .catch((error) => {
      console.error('Failed to initialize core services:', error);
    });

  // Initialize update service for handling Chrome extension updates
  // Critical for extensions with persistent connections or native messaging
  getUpdateService().initialize().catch((error) => {
    console.error('Failed to initialize update service:', error);
  });

  // Initialize popup monitor service for handling abandoned requests
  // Handles cases where user closes popup or walks away
  getPopupMonitorService().initialize();
  
  // Register proxy services (existing pattern)
  registerWalletService();
  registerProviderService();
  registerConnectionService();
  registerApprovalService();
  
  // Set up MessageBus handlers for provider requests
  MessageBus.onMessage('provider-request', async (data) => {
    const message = data as ProviderMessage;
    console.debug('Provider request received:', {
      origin: message.origin,
      method: message.data?.method,
      hasParams: !!message.data?.params,
      timestamp: message.timestamp
    });

    try {
      const providerService = getProviderService();
      
      // Extract request details
      const { origin, data: requestData } = message;
      const { method, params = [], metadata = {} } = requestData || {};

      if (!method) {
        return {
          success: false,
          error: createJsonRpcError(
            JSON_RPC_ERROR_CODES.INVALID_REQUEST,
            'Method is required'
          )
        };
      }

      // Handle the request through provider service
      const result = await providerService.handleRequest(
        origin,
        method,
        params,
        metadata
      );

      return {
        success: true,
        result,
        method // Include method for response handling
      };
    } catch (error: any) {
      console.error('Provider request failed:', error);
      
      // Determine appropriate error code
      let errorCode: number = JSON_RPC_ERROR_CODES.INTERNAL_ERROR;
      
      if (error.message?.includes('User denied') || error.message?.includes('User rejected')) {
        errorCode = PROVIDER_ERROR_CODES.USER_REJECTED;
      } else if (error.message?.includes('not connected') || error.message?.includes('Unauthorized')) {
        errorCode = PROVIDER_ERROR_CODES.UNAUTHORIZED;
      } else if (error.message?.includes('not supported') || error.message?.includes('not found')) {
        errorCode = JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND;
      } else if (error.message?.includes('Invalid params')) {
        errorCode = JSON_RPC_ERROR_CODES.INVALID_PARAMS;
      }
      
      return {
        success: false,
        error: createJsonRpcError(
          error.code || errorCode,
          error.message || 'Unknown error'
        )
      };
    }
  });

  
  // Handle provider event emission (for accountsChanged, disconnect, etc.)
  MessageBus.onMessage('provider-event', async (data) => {
    const message = data as EventMessage;
    const { origin, event, data: eventData } = message;
    
    try {
      if (origin) {
        await emitProviderEvent(origin, event, eventData);
      } else {
        await emitProviderEvent(event, eventData);
      }
      return { success: true };
    } catch (error: any) {
      console.error('Failed to emit provider event:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Check session recovery state on startup (non-blocking)
  checkSessionRecovery().then(recoveryState => {
    
    if (recoveryState === SessionRecoveryState.LOCKED) {
      // Session expired or doesn't exist - ensure everything is locked
      const walletService = getWalletService();
      walletService.lockAllWallets().catch(error => {
        console.error('Failed to lock wallets during session recovery:', error);
      });
    } else if (recoveryState === SessionRecoveryState.NEEDS_REAUTH) {
      // Valid session but secrets lost - notify popup to show auth modal
      // The popup will handle this when it checks wallet state
    }
  }).catch(error => {
    console.error('Session recovery check failed:', error);
    // Continue execution even if session recovery fails
  });
  
  // Set up Chrome alarms for session management and keep-alive
  const KEEP_ALIVE_ALARM_NAME = 'keep-alive';
  const SESSION_EXPIRY_ALARM_NAME = 'session-expiry';
  
  // Create keep-alive alarm to prevent service worker termination
  // This replaces the memory-leaking setTimeout approach
  chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
    periodInMinutes: 0.4 // 24 seconds (less than Chrome's 30s timeout)
  });
  
  // Consolidated alarm handler to avoid multiple listeners
  if (chrome?.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      switch (alarm.name) {
        case SESSION_EXPIRY_ALARM_NAME:
          console.log('Session expired via alarm');
          const walletService = getWalletService();
          await walletService.lockAllWallets();
          break;
          
        case KEEP_ALIVE_ALARM_NAME:
          // Perform minimal activity to keep service worker alive
          // This is automatically cleaned up when the service worker terminates
          chrome.storage.local.get('keep-alive-ping', () => {
            // Just accessing storage is enough to keep the worker alive
          });
          break;
      }
    });
  }


  // Emit events to content scripts
  // This will be used for accountsChanged, disconnect, etc.
  // Enhanced to support origin-specific events for address-level connections
  async function emitProviderEvent(originOrEvent: string, eventOrData?: string | any, data?: any) {
    // Handle both signatures:
    // emitProviderEvent(event, data) - broadcast to all
    // emitProviderEvent(origin, event, data) - send to specific origin
    
    let origin: string | undefined;
    let event: string;
    let eventData: any;
    
    if (data !== undefined) {
      // Three parameters: origin-specific event
      origin = originOrEvent;
      event = eventOrData as string;
      eventData = data;
    } else {
      // Two parameters: broadcast event
      event = originOrEvent;
      eventData = eventOrData;
    }
    
    // Use our safe broadcasting utility
    const message = {
      type: 'PROVIDER_EVENT',
      event,
      data: eventData
    };
    
    // If origin specified, filter tabs by origin
    const filter = origin ? (tab: chrome.tabs.Tab) => {
      if (!tab.url) return false;
      try {
        const tabOrigin = new URL(tab.url).origin;
        return tabOrigin === origin;
      } catch {
        return false;
      }
    } : undefined;
    
    // Broadcast using our safe utility
    await broadcastToTabs(message, filter);
  }

  // Register the emitProviderEvent function with the event emitter service
  // This makes it available to other services without using global variables
  eventEmitterService.on('emit-provider-event', (...args: unknown[]) => {
    const [eventArgs] = args as [{ origin?: string; event: string; data: unknown }];
    if (eventArgs.origin) {
      emitProviderEvent(eventArgs.origin, eventArgs.event, eventArgs.data);
    } else {
      emitProviderEvent(eventArgs.event, eventArgs.data);
    }
  });
  

  // Add cleanup handlers for service worker termination
  if ('onSuspend' in chrome.runtime) {
    chrome.runtime.onSuspend.addListener(() => {
      console.log('Service worker suspending, cleaning up all services...');
      
      // Destroy all services via registry
      serviceRegistry.destroyAll().catch(console.error);
      
      // Also cleanup provider service (until it's migrated to BaseService)
      const providerService = getProviderService();
      if (providerService.destroy) {
        providerService.destroy().catch(console.error);
      }

      // Cleanup update service
      const updateService = getUpdateService();
      updateService.destroy();
    });
  }
  
  // Alternative cleanup for when service worker is about to be terminated
  if ('onSuspendCanceled' in chrome.runtime) {
    chrome.runtime.onSuspendCanceled.addListener(() => {
      console.log('Service worker suspension canceled');
    });
  }
  
  // Note: chrome.runtime.onShutdown is not available in all browsers
  // The onSuspend handler above will handle most cleanup scenarios

  console.debug('Background script initialized with ServiceRegistry and cleanup handlers');
});
