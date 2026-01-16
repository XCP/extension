import { registerWalletService, getWalletService } from '@/services/walletService';
import { registerProviderService, getProviderService } from '@/services/providerService';
import { registerConnectionService } from '@/services/connectionService';
import { registerApprovalService } from '@/services/approvalService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { ServiceRegistry } from '@/services/core/ServiceRegistry';
import { MessageBus, type ProviderMessage, type ApprovalMessage, type EventMessage } from '@/services/core/MessageBus';
import { checkSessionRecovery, SessionRecoveryState } from '@/utils/auth/sessionManager';
import { serviceKeepAlive } from '@/utils/storage/serviceStateStorage';
import { JSON_RPC_ERROR_CODES, PROVIDER_ERROR_CODES, createJsonRpcError } from '@/utils/errors';
import { broadcastToTabs } from '@/utils/browser';
import { getUpdateService } from '@/services/updateService';
import { getPopupMonitorService } from '@/services/popupMonitorService';
import { requestCleanup } from '@/utils/provider/requestCleanup';
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
   * This listener MUST be the first thing registered to consume errors immediately.
   * It runs synchronously before any async operations or other initialization.
   */

  // Single consolidated message handler for error consumption AND message handling
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. IMMEDIATELY check and consume lastError to prevent console warnings
    //    This must happen before any other logic
    if (chrome.runtime.lastError) {
      // Error consumed - prevents "Unchecked runtime.lastError" spam
      // Common during extension startup when Chrome tries to reconnect to tabs
    }

    // 2. SECURITY: Validate sender is from our own extension
    //    This prevents malicious web pages from sending messages to our background
    //    See: OWASP Browser Extension Vulnerabilities - Insecure Message Passing
    if (sender.id !== chrome.runtime.id) {
      console.warn('[Background] Rejected message from unknown sender:', sender.id);
      return false;
    }

    // 3. Track content script readiness (internal signal, no response needed)
    //    Content scripts have sender.tab set
    if (message && message.__xcp_cs_ready && sender.tab?.id) {
      readyTabs.add(sender.tab.id);
      console.log(`[Background] Content script ready on tab ${sender.tab.id}:`, message.tabUrl);
      return false; // Don't respond - this is just a signal
    }

    // 4. Debug logging in development only
    if (process.env.NODE_ENV === 'development') {
      const messageType = message?.type || message?.action || (message?.serviceName ? `${message.serviceName}.${message.methodName}` : 'unknown');
      console.log('[Background] Received message:', messageType, 'from:', sender.tab?.url || sender.url || 'extension');
    }

    // 5. Handle ping requests immediately (allowed from content scripts and extension pages)
    if (message?.action === 'ping' || message?.type === 'startup-health-check') {
      sendResponse({ status: 'ready', timestamp: Date.now(), context: 'background' });
      return true;
    }

    // 6. Handle compose events from popup/sidepanel (cross-context event emission)
    //    SECURITY: Only allow from extension pages, not content scripts
    if (message?.type === 'COMPOSE_EVENT') {
      // Verify sender is an extension page (popup, sidepanel, tab), not a content script
      const isExtensionPage = sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`) ||
                              sender.url?.startsWith(`moz-extension://${chrome.runtime.id}/`);
      if (!isExtensionPage) {
        console.warn('[Background] Rejected COMPOSE_EVENT from non-extension page:', sender.url);
        sendResponse({ success: false, error: { message: 'Unauthorized sender', code: 4100 } });
        return true;
      }

      const { event, data } = message;
      if (event) {
        eventEmitterService.emit(event, data);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: { message: 'Event name required', code: -32602 } });
      }
      return true;
    }

    // Let other handlers (like proxy.ts service handlers) process the message
    return false;
  });

  // Single consolidated port handler for error consumption and message handling
  // This prevents duplicate listeners being added per port
  chrome.runtime.onConnect.addListener((port) => {
    // Check for connection errors immediately
    if (chrome.runtime.lastError) {
      // Error consumed - handles port connection failures
    }

    // SECURITY: Validate port sender is from our own extension
    if (port.sender?.id !== chrome.runtime.id) {
      console.warn('[Background] Rejected port connection from unknown sender:', port.sender?.id);
      port.disconnect();
      return;
    }

    // Handle ping messages on this port
    port.onMessage.addListener((msg) => {
      if (msg?.action === 'ping') {
        port.postMessage({ status: 'ready', timestamp: Date.now() });
      }
    });

    // Single disconnect handler (instead of adding multiple)
    port.onDisconnect.addListener(() => {
      // Consume disconnect errors
      if (chrome.runtime.lastError) {
        // Error consumed - handles port disconnection issues
      }
    });
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

  // Note: Port connection handling is consolidated in the early onConnect handler above
  // to prevent duplicate listeners being added per port

  console.log('[Background] Core listeners registered');

  // ============================================================
  // SERVICE INITIALIZATION
  // ============================================================

  // Initialize service registry
  const serviceRegistry = ServiceRegistry.getInstance();

  // Track initialization state for health checks
  let servicesReady = false;
  let initError: Error | null = null;

  // Helper to check if services are ready
  function getServicesStatus(): { ready: boolean; error?: string } {
    return {
      ready: servicesReady,
      error: initError?.message
    };
  }

  // Sequential initialization to ensure proper ordering
  async function initializeServices(): Promise<void> {
    try {
      // 1. Register proxy services first (synchronous, sets up message listeners)
      registerWalletService();
      registerProviderService();
      registerConnectionService();
      registerApprovalService();
      console.log('[Background] Proxy services registered');

      // 2. Initialize event emitter via registry (for lifecycle management)
      await serviceRegistry.register(eventEmitterService);
      console.log('[Background] EventEmitterService initialized');

      // 3. Initialize update service
      await getUpdateService().initialize();
      console.log('[Background] UpdateService initialized');

      // 4. Initialize popup monitor service
      getPopupMonitorService().initialize();
      console.log('[Background] PopupMonitorService initialized');

      // 5. Start request cleanup (periodic cleanup of expired approval requests)
      requestCleanup.startCleanup();
      console.log('[Background] RequestCleanup started');

      // 6. Check session recovery state (may lock wallets if session expired)
      const recoveryState = await checkSessionRecovery();
      if (recoveryState === SessionRecoveryState.LOCKED) {
        const walletService = getWalletService();
        await walletService.lockKeychain();
        console.log('[Background] Wallets locked due to session recovery state');
      } else if (recoveryState === SessionRecoveryState.NEEDS_REAUTH) {
        console.log('[Background] Session needs re-authentication');
      }

      servicesReady = true;
      console.log('[Background] All services initialized successfully');
    } catch (error) {
      initError = error instanceof Error ? error : new Error(String(error));
      console.error('[Background] Service initialization failed:', error);
      // Still mark as ready to prevent deadlock, but log the error
      servicesReady = true;
    }
  }

  // Start initialization (non-blocking to avoid Chrome timeout)
  const initPromise = initializeServices();

  // ============================================================
  // WEBEXT-BRIDGE HANDLERS
  // ============================================================

  // Initialize webext-bridge handlers at top level of defineBackground
  // This ensures they're registered when the service worker starts
  webextBridgeOnMessage('webext-bridge-keep-alive', () => {
    return { alive: true };
  });

  webextBridgeOnMessage('startup-health-check', async () => {
    // Wait for services to be ready before reporting healthy
    if (!servicesReady) {
      await initPromise;
    }
    const status = getServicesStatus();
    return {
      status: status.ready ? 'ready' : 'initializing',
      timestamp: Date.now(),
      services: status.ready ? 'ready' : 'initializing',
      error: status.error
    };
  });

  console.log('[Background] webext-bridge handlers registered');
  
  // Set up MessageBus handlers for provider requests
  // ISSUE 4 FIX: Add runtime validation before type assertion
  MessageBus.onMessage('provider-request', async (data) => {
    // Validate data structure before using
    if (!data || typeof data !== 'object') {
      console.error('[Background] Invalid provider-request data: expected object');
      return {
        success: false,
        error: createJsonRpcError(JSON_RPC_ERROR_CODES.INVALID_REQUEST, 'Invalid message format')
      };
    }

    const message = data as Record<string, unknown>;

    // Validate origin is a string
    if (typeof message.origin !== 'string') {
      console.error('[Background] Invalid provider-request data: origin must be string');
      return {
        success: false,
        error: createJsonRpcError(JSON_RPC_ERROR_CODES.INVALID_REQUEST, 'Invalid message format')
      };
    }

    console.debug('Provider request received:', {
      origin: message.origin,
      method: (message.data as Record<string, unknown>)?.method,
      hasParams: !!(message.data as Record<string, unknown>)?.params,
      timestamp: message.timestamp
    });

    try {
      const providerService = getProviderService();

      // Extract request details with validation
      const origin = message.origin as string;
      const requestData = (message.data || {}) as Record<string, unknown>;
      const method = requestData.method;
      const params = Array.isArray(requestData.params) ? requestData.params : [];
      const metadata = (typeof requestData.metadata === 'object' && requestData.metadata !== null)
        ? requestData.metadata as Record<string, unknown>
        : {};

      if (!method || typeof method !== 'string') {
        return {
          success: false,
          error: createJsonRpcError(
            JSON_RPC_ERROR_CODES.INVALID_REQUEST,
            'Method is required and must be a string'
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
      console.error('[Background] Provider request failed:', error);

      // Determine appropriate error code and message
      // ISSUE 1 FIX: Use generic messages for internal errors, only pass through user-facing errors
      let errorCode: number = JSON_RPC_ERROR_CODES.INTERNAL_ERROR;
      let errorMessage: string = 'Request failed'; // Generic default

      if (error.message?.includes('User denied') || error.message?.includes('User rejected')) {
        errorCode = PROVIDER_ERROR_CODES.USER_REJECTED;
        errorMessage = error.message; // User-facing, safe to pass through
      } else if (error.message?.includes('not connected') || error.message?.includes('Unauthorized')) {
        errorCode = PROVIDER_ERROR_CODES.UNAUTHORIZED;
        errorMessage = error.message; // User-facing, safe to pass through
      } else if (error.message?.includes('Wallet is locked')) {
        errorCode = PROVIDER_ERROR_CODES.UNAUTHORIZED;
        errorMessage = error.message; // User-facing, safe to pass through
      } else if (error.message?.includes('not supported') || error.message?.includes('not found')) {
        errorCode = JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND;
        errorMessage = 'Method not supported'; // Generic
      } else if (error.message?.includes('Invalid params')) {
        errorCode = JSON_RPC_ERROR_CODES.INVALID_PARAMS;
        errorMessage = 'Invalid parameters'; // Generic
      }
      // All other errors get the generic "Request failed" message

      return {
        success: false,
        error: createJsonRpcError(
          error.code || errorCode,
          errorMessage
        )
      };
    }
  });

  
  // Handle provider event emission (for accountsChanged, disconnect, etc.)
  // ISSUE 4 FIX: Add runtime validation before type assertion
  MessageBus.onMessage('provider-event', async (data) => {
    // Validate data structure before using
    if (!data || typeof data !== 'object') {
      console.error('[Background] Invalid provider-event data: expected object');
      return { success: false, error: { message: 'Invalid message format', code: -32600 } };
    }

    const message = data as Record<string, unknown>;

    // Validate required fields
    if (typeof message.event !== 'string') {
      console.error('[Background] Invalid provider-event data: event must be string');
      return { success: false, error: { message: 'Invalid message format', code: -32600 } };
    }

    const origin = typeof message.origin === 'string' ? message.origin : undefined;
    const event = message.event;
    const eventData = message.data;

    try {
      if (origin) {
        await emitProviderEventToOrigin(origin, event, eventData);
      } else {
        await broadcastProviderEvent(event, eventData);
      }
      return { success: true };
    } catch (error: any) {
      console.error('[Background] Failed to emit provider event:', error);
      return { success: false, error: { message: 'Failed to emit event', code: -32603 } };
    }
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
          console.log('[Background] Session expired via alarm');
          const walletService = getWalletService();
          await walletService.lockKeychain();
          break;
          
        case KEEP_ALIVE_ALARM_NAME:
          // Perform minimal activity to keep service worker alive
          await serviceKeepAlive('background');
          break;
      }
    });
  }


  // ISSUE 3 FIX: Split into two separate functions to avoid overload ambiguity
  // Previously, emitProviderEvent(origin, event, undefined) was misinterpreted as broadcast

  /**
   * Broadcast a provider event to all connected tabs
   */
  async function broadcastProviderEvent(event: string, eventData: unknown): Promise<void> {
    const message = {
      type: 'PROVIDER_EVENT',
      event,
      data: eventData
    };
    await broadcastToTabs(message);
  }

  /**
   * Emit a provider event to tabs matching a specific origin
   */
  async function emitProviderEventToOrigin(origin: string, event: string, eventData: unknown): Promise<void> {
    const message = {
      type: 'PROVIDER_EVENT',
      event,
      data: eventData
    };

    const filter = (tab: chrome.tabs.Tab) => {
      if (!tab.url) return false;
      try {
        const tabOrigin = new URL(tab.url).origin;
        return tabOrigin === origin;
      } catch {
        return false;
      }
    };

    await broadcastToTabs(message, filter);
  }

  // Register the provider event emitter with the event emitter service
  // This makes it available to other services without using global variables
  // ISSUE 2 FIX: Use async handler and await the calls to prevent unhandled rejections
  // ISSUE 4 FIX: Validate eventArgs structure before using
  eventEmitterService.on('emit-provider-event', async (...args: unknown[]) => {
    try {
      const [eventArgs] = args;

      // Runtime validation of event args structure
      if (!eventArgs || typeof eventArgs !== 'object') {
        console.error('[Background] Invalid emit-provider-event args: expected object');
        return;
      }

      const typedArgs = eventArgs as Record<string, unknown>;
      if (typeof typedArgs.event !== 'string') {
        console.error('[Background] Invalid emit-provider-event args: event must be string');
        return;
      }

      if (typedArgs.origin !== undefined && typeof typedArgs.origin === 'string') {
        await emitProviderEventToOrigin(typedArgs.origin, typedArgs.event, typedArgs.data);
      } else {
        await broadcastProviderEvent(typedArgs.event, typedArgs.data);
      }
    } catch (error) {
      console.error('[Background] Failed to emit provider event:', error);
    }
  });
  

  // Add cleanup handlers for service worker termination
  if ('onSuspend' in chrome.runtime) {
    chrome.runtime.onSuspend.addListener(() => {
      console.log('[Background] Service worker suspending, cleaning up all services...');
      
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

      // Cleanup popup monitor service
      const popupMonitor = getPopupMonitorService();
      popupMonitor.destroy();
    });
  }
  
  // Alternative cleanup for when service worker is about to be terminated
  if ('onSuspendCanceled' in chrome.runtime) {
    chrome.runtime.onSuspendCanceled.addListener(() => {
      console.log('[Background] Service worker suspension canceled');
    });
  }
  
  // Note: chrome.runtime.onShutdown is not available in all browsers
  // The onSuspend handler above will handle most cleanup scenarios

  console.debug('Background script initialized with ServiceRegistry and cleanup handlers');
});
