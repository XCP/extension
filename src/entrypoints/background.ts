// Import onMessage directly from webext-bridge/background to prevent runtime.lastError
import { onMessage as webextBridgeOnMessage } from 'webext-bridge/background';
import { checkSessionRecovery, expireSessionIfNeeded, rearmSessionExpiry, SessionRecoveryState } from '@/platform/auth/sessionManager';
import { markSessionRecovery } from '@/platform/auth/sessionReady';
import { broadcastToTabs } from '@/platform/browser';
import { registerApprovalService } from '@/services/approvalService';
import { getConnectionService, registerConnectionService } from '@/services/connectionService';
import { ServiceRegistry } from '@/services/core/ServiceRegistry';
import { getReadinessState, markServicesReady, whenServicesReady } from '@/services/core/serviceReadiness';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getPopupMonitorService } from '@/services/popupMonitorService';
import { getProviderService, registerProviderService } from '@/services/providerService';
import { registerProviderSigningService } from '@/services/providerSigningService';
import { getUpdateService } from '@/services/updateService';
import { getWalletService, registerWalletService } from '@/services/walletService';

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

    // Let other handlers (like proxy.ts service handlers) process the message
    return false;
  });

  // Single consolidated port handler for error consumption and message handling
  // This prevents duplicate listeners being added per port
  chrome.runtime.onConnect.addListener((port) => {
    if (chrome.runtime.lastError) { /* consumed */ }

    // SECURITY: Validate port sender is from our own extension
    if (port.sender?.id !== chrome.runtime.id) {
      console.warn('[Background] Rejected port connection from unknown sender:', port.sender?.id);
      port.disconnect();
      return;
    }

    // Proxy service ports are handled by their own onConnect listeners in proxy.ts
    if (port.name.startsWith('proxy:')) return;

    port.onMessage.addListener((msg) => {
      if (msg?.action === 'ping') {
        port.postMessage({ status: 'ready', timestamp: Date.now() });
      }
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) { /* consumed */ }
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

  // Sequential initialization to ensure proper ordering
  async function initializeServices(): Promise<void> {
    try {
      // 1. Register proxy services first (synchronous, sets up message listeners)
      registerWalletService();
      registerProviderService();
      registerConnectionService();
      registerApprovalService();
      registerProviderSigningService();
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

      // 6. Check session recovery state (may lock wallets if session expired). Anything that
      //    re-derives from the session master key waits on the outcome of this — see sessionReady.
      const recoveryState = await checkSessionRecovery();
      markSessionRecovery(recoveryState);
      if (recoveryState === SessionRecoveryState.LOCKED) {
        const walletService = getWalletService();
        await walletService.lockKeychain();
        console.log('[Background] Wallets locked due to session recovery state');
      } else if (recoveryState === SessionRecoveryState.NEEDS_REAUTH) {
        console.log('[Background] Session valid; wallet secrets will be re-derived from the session master key');
      }
      if (recoveryState !== SessionRecoveryState.LOCKED) {
        // Re-arm the auto-lock alarm in case it was lost (extension update,
        // or a crash between alarm scheduling calls). No-op when expired.
        await rearmSessionExpiry();
      }

      // 7. Load the keychain before anything is served. The master key outlives the worker but the
      //    decrypted keychain does not, and every answer about accounts, permissions or lock state
      //    reads from it — so it is loaded once, here, rather than checked for on each call.
      await getWalletService().ensureKeychainLoaded();

      // 8. Open the barrier proxied calls have been waiting at — see serviceReadiness.
      markServicesReady();

      // 9. Tell tabs that were already open that the worker is back.
      await announceReadinessToConnectedTabs();

      console.log('[Background] All services initialized successfully');
    } catch (error) {
      console.error('[Background] Service initialization failed:', error);
      // An initialisation that failed cannot vouch for the session, so callers waiting on it are
      // told locked rather than left hanging. The barrier then opens on that verdict: a call that
      // fails is recoverable, a call that hangs is not.
      markSessionRecovery(SessionRecoveryState.LOCKED);
      markServicesReady(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Re-announce each connected origin's accounts once the worker has finished waking.
   *
   * A page that was open when the worker died holds a dead port and has no way to notice it came
   * back. MetaMask sends a READY message to every tab for the same reason; sending the accounts
   * instead means the page gets the answer it would have asked for, over the provider-event path
   * that already works.
   *
   * Deliberately last: the accounts are only true once recovery has decided whether this session
   * is still valid.
   */
  async function announceReadinessToConnectedTabs(): Promise<void> {
    try {
      const walletService = getWalletService();
      if (!(await walletService.isKeychainUnlocked())) return;

      // Asked of the service that owns the answer, not read off the settings it keeps it in.
      const connections = await getConnectionService().getConnectedWebsites();
      if (connections.length === 0) return;

      const activeAddress = await walletService.getActiveAddress();
      const accounts = activeAddress ? [activeAddress.address] : [];

      for (const { origin } of connections) {
        eventEmitterService.emit('emit-provider-event', {
          origin,
          event: 'accountsChanged',
          data: accounts,
        });
      }
      console.log('[Background] Re-announced accounts to', connections.length, 'origin(s)');
    } catch (error) {
      // A page that misses this falls back to asking, which now answers correctly anyway.
      console.warn('[Background] Could not announce readiness:', error);
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
    if (!getReadinessState().ready) {
      await initPromise;
    }
    const status = getReadinessState();
    return {
      status: status.ready ? 'ready' : 'initializing',
      timestamp: Date.now(),
      services: status.ready ? 'ready' : 'initializing',
      error: status.error
    };
  });

  console.log('[Background] webext-bridge handlers registered');
  
  // Session expiry is authoritative in persisted metadata; idle workers may suspend.
  const SESSION_EXPIRY_ALARM_NAME = 'session-expiry';
  chrome.alarms.clear('keep-alive').catch(error => console.warn('[Background] Could not clear legacy alarm:', error));

  // Consolidated alarm handler to avoid multiple listeners
  if (chrome?.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== SESSION_EXPIRY_ALARM_NAME) return;
      // A delayed alarm for an earlier deadline must not lock a renewed session.
      whenServicesReady().then(() => expireSessionIfNeeded()).catch(error => {
        console.error('[Background] Session expiry check failed:', error);
      });
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

  // Internal events have a typed contract; the emitter observes asynchronous delivery failures.
  eventEmitterService.on('emit-provider-event', async ({ origin, event, data }) => {
    if (origin !== undefined) await emitProviderEventToOrigin(origin, event, data);
    else await broadcastProviderEvent(event, data);
  });
  

  // Add cleanup handlers for service worker termination
  if ('onSuspend' in chrome.runtime) {
    chrome.runtime.onSuspend.addListener(() => {
      console.log('[Background] Service worker suspending, cleaning up all services...');
      
      // Destroy all services via registry
      serviceRegistry.destroyAll().catch((error) => {
        console.error('[Background] Failed to destroy services:', error);
      });
      
      // Also cleanup provider service (until it's migrated to BaseService)
      const providerService = getProviderService();
      if (providerService.destroy) {
        providerService.destroy().catch((error) => {
          console.error('[Background] Failed to destroy provider service:', error);
        });
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
