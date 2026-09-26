// Import onMessage directly from webext-bridge/background to prevent runtime.lastError
import { onMessage as webextBridgeOnMessage } from 'webext-bridge/background';
import { checkSessionRecovery, expireSessionIfNeeded, rearmSessionExpiry, SessionRecoveryState } from '@/platform/auth/sessionManager';
import { markSessionRecovery } from '@/platform/auth/sessionReady';
import { deliverProviderEvent, wereAccountsAnnounced } from '@/platform/browser';
import { getCachedKeychainMasterKey } from '@/platform/storage/keyStorage';
import { getApprovalService, registerApprovalService } from '@/services/approvalService';
import { getConnectionService, registerConnectionService } from '@/services/connectionService';
import { ServiceRegistry } from '@/services/core/ServiceRegistry';
import { getReadinessState, markServicesReady, whenServicesReady } from '@/services/core/serviceReadiness';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getPopupMonitorService } from '@/services/popupMonitorService';
import { registerProviderService } from '@/services/providerService';
import { registerProviderSigningService } from '@/services/providerSigningService';
import { getUpdateService } from '@/services/updateService';
import { getWalletService, registerWalletService } from '@/services/walletService';

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

    // 3. Debug logging in development only
    if (process.env.NODE_ENV === 'development') {
      const messageType = message?.type || message?.action || (message?.serviceName ? `${message.serviceName}.${message.methodName}` : 'unknown');
      console.log('[Background] Received message:', messageType, 'from:', sender.tab?.url || sender.url || 'extension');
    }

    // 4. Handle ping requests immediately (allowed from content scripts and extension pages)
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

  // No tab listeners here on purpose: every one of them wakes this worker on every page load in
  // the browser. Which tabs a provider event concerns is learned from provider ports instead
  // (see platform/browser.ts).

  // These wake the worker too, so they are registered here, in the first turn, like the ones above:
  // Chrome delivers the waking event only to listeners that exist by the end of it. Each handler
  // waits for initialisation (whenServicesReady) before acting on wallet state.
  //  - The popup-lifecycle port, which cancels a signing request whose approval window closed.
  //  - onUpdateAvailable, which Chrome may fire once, on the very wake it causes.
  getPopupMonitorService().initialize();
  getUpdateService().listen();

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

      // 2b. Initialize the approval and connection services. Registering a proxy only answers
      //     calls; initializing is what resumes an approval left pending by the previous worker
      //     and installs the handler that completes a connect approval nobody is waiting on any
      //     more. Approval first: the connection service registers its handler on it.
      //     Deliberately not in the registry: its destroy() rejects the pending approval, which
      //     is the very thing this exists to carry across a restart.
      await getApprovalService().initialize();
      await getConnectionService().initialize();
      console.log('[Background] ApprovalService and ConnectionService initialized');

      // 3. Initialize update service (its listener was registered in the first turn). An update
      //    never reloads the extension out from under an approval waiting on the user.
      const updateService = getUpdateService();
      updateService.addBusyCheck(() => getApprovalService().hasPendingApproval());
      await updateService.initialize();
      console.log('[Background] UpdateService initialized');

      // 6. Check session recovery state (may lock wallets if session expired). Anything that
      //    re-derives from the session master key waits on the outcome of this — see sessionReady.
      const recoveryState = await checkSessionRecovery();
      markSessionRecovery(recoveryState);
      if (recoveryState === SessionRecoveryState.LOCKED) {
        // A fresh worker holds no decrypted state, and recovery has already cleared an expired
        // session. The one thing a wake can still find is a master key left without its session
        // (a crash between the two removals); only then is there anything to lock. Locking an
        // already-locked wallet on every wake cost a storage round trip each time and, while the
        // popup notification was awaited, held every waiting dApp request for ~5s.
        if (await getCachedKeychainMasterKey()) {
          await getWalletService().lockKeychain();
          console.log('[Background] Wallets locked due to session recovery state');
        }
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
   *
   * Only origins whose pages were last told something else are sent anything: a wake that changes
   * nothing, the usual kind, sends nothing.
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

      let announced = 0;
      for (const { origin } of connections) {
        if (await wereAccountsAnnounced(origin, accounts)) continue;
        eventEmitterService.emit('emit-provider-event', {
          origin,
          event: 'accountsChanged',
          data: accounts,
        });
        announced++;
      }
      if (announced > 0) console.log('[Background] Re-announced accounts to', announced, 'origin(s)');
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
  // Alarms outlive the version that created them, and a periodic one wakes the worker whether or
  // not anything still listens for it. The per-service persist and update-check alarms are cleared
  // by their owners as they initialize.
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


  /**
   * Deliver a provider event to the pages of one origin: only to the tabs that origin's pages were
   * seen using the provider from, never to every tab. The worker cannot read `tab.url` (it holds
   * neither the `tabs` permission nor host permissions), so the tabs are the ones recorded from
   * provider ports; the content script still drops any event not addressed to its own page.
   */
  // Internal events have a typed contract; the emitter observes asynchronous delivery failures.
  eventEmitterService.on('emit-provider-event', async ({ origin, event, data }) => {
    await deliverProviderEvent(origin, event, data);
  });


  // No onSuspend teardown, on purpose. Nothing needs saving there: every service persists its
  // state as it changes, and the worker's memory goes with it. Tearing down was harmful instead:
  // on an event-page browser a suspend can be canceled, and the torn-down worker kept running with
  // the provider-event forwarder above, the update listener and the popup monitor all gone.

  console.debug('Background script initialized');
});
