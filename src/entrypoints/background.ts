import {
  checkSessionRecovery,
  expireSessionIfNeeded,
  rearmSessionExpiry,
  SESSION_EXPIRY_ALARM,
  SessionRecoveryState,
} from '@/platform/auth/sessionManager';
import { markSessionRecovery } from '@/platform/auth/sessionReady';
import { deliverProviderEvent, wereAccountsAnnounced } from '@/platform/browser';
import { getCachedKeychainMasterKey } from '@/platform/storage/keyStorage';
import { getApprovalService, registerApprovalService } from '@/services/approvalService';
import { getConnectionService } from '@/services/connectionService';
import { markServicesReady, whenServicesReady } from '@/platform/serviceReadiness';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getPopupMonitorService } from '@/services/popupMonitorService';
import { registerProviderService } from '@/services/providerService';
import { registerProviderSigningService } from '@/services/providerSigningService';
import { getUpdateService } from '@/services/updateService';
import { getWalletService, registerWalletService } from '@/services/walletService';

/**
 * Alarms earlier versions created. Alarms outlive the version that created them, and a periodic one
 * wakes the worker whether or not anything still listens for it, so an update clears them once.
 * Clearing one that does not exist is a no-op.
 */
const LEGACY_ALARMS = [
  'keep-alive',
  'notification-poll',
  'update-service-periodic-check',
  // Per-service keep-alive and persistence alarms from the old service base class.
  ...['ApprovalService', 'BlockchainService', 'ConnectionService', 'EventEmitterService', 'TransactionService']
    .flatMap(service => [`${service}-keepalive`, `${service}-persist`]),
];

export default defineBackground(() => {
  // No tab listeners here on purpose: every one of them wakes this worker on every page load in
  // the browser. Which tabs a provider event concerns is learned from provider ports instead
  // (see platform/browser.ts). Nor a runtime.onMessage one: nothing sends the worker one-off
  // messages; extension pages and content scripts reach it over proxy ports (platform/proxy.ts).

  // Everything that can wake the worker is registered here, in the first turn: Chrome delivers the
  // waking event only to listeners that exist by the end of it. Each handler waits for
  // initialisation (whenServicesReady) before acting on wallet state.
  //  - The popup-lifecycle port, which cancels a signing request whose approval window closed.
  //  - onUpdateAvailable, which Chrome may fire once, on the very wake it causes.
  //  - onInstalled, which fires once after an update and clears the alarms older versions left.
  //  - onAlarm, for the session-expiry alarm (below).
  getPopupMonitorService().initialize();
  getUpdateService().listen();
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== 'update') return;
    for (const name of LEGACY_ALARMS) {
      chrome.alarms.clear(name).catch(error => console.warn('[Background] Could not clear legacy alarm:', name, error));
    }
  });

  console.log('[Background] Core listeners registered');

  // ============================================================
  // SERVICE INITIALIZATION
  // ============================================================

  // Sequential initialization to ensure proper ordering
  async function initializeServices(): Promise<void> {
    try {
      // 1. Register proxy services first (synchronous, sets up message listeners)
      registerWalletService();
      registerProviderService();
      registerApprovalService();
      registerProviderSigningService();
      console.log('[Background] Proxy services registered');

      // 2. Initialize the approval and connection services. Registering a proxy only answers
      //    calls; initializing is what resumes an approval left pending by the previous worker
      //    and installs the handler that completes a connect approval nobody is waiting on any
      //    more. Approval first: the connection service registers its handler on it.
      await getApprovalService().initialize();
      getConnectionService().initialize();
      console.log('[Background] ApprovalService and ConnectionService initialized');

      // 3. Initialize update service (its listener was registered in the first turn). An update
      //    never reloads the extension out from under an approval waiting on the user.
      const updateService = getUpdateService();
      updateService.addBusyCheck(() => getApprovalService().hasPendingApproval());
      await updateService.initialize();
      console.log('[Background] UpdateService initialized');

      // 4. Check session recovery state (may lock wallets if session expired). Anything that
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

      // 5. Load the keychain before anything is served. The master key outlives the worker but the
      //    decrypted keychain does not, and every answer about accounts, permissions or lock state
      //    reads from it — so it is loaded once, here, rather than checked for on each call.
      await getWalletService().ensureKeychainLoaded();

      // 6. Open the barrier proxied calls have been waiting at — see serviceReadiness.
      markServicesReady();

      // 7. Tell tabs that were already open that the worker is back.
      await announceReadinessToConnectedTabs();

      console.log('[Background] All services initialized successfully');
    } catch (error) {
      console.error('[Background] Service initialization failed:', error);
      // An initialisation that failed cannot vouch for the session, so callers waiting on it are
      // told locked rather than left hanging. The barrier then opens on that verdict: a call that
      // fails is recoverable, a call that hangs is not.
      markSessionRecovery(SessionRecoveryState.LOCKED);
      markServicesReady();
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
  void initializeServices();

  // Session expiry is authoritative in persisted metadata; idle workers may suspend. The one alarm
  // this version uses, so the one listener.
  if (chrome?.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== SESSION_EXPIRY_ALARM) return;
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
