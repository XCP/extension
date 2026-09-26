/**
 * Update Service - applies a Chrome extension update without cutting anyone off.
 *
 * Chrome announces a downloaded update through runtime.onUpdateAvailable. With a listener present
 * it waits for the extension to reload itself; without one reloading, it applies the update when
 * the worker is next idle and stopped. So this service reloads only once nothing is in use — no
 * signing request in flight, no connect approval pending, no extension page open — and otherwise
 * keeps checking, which in the worst case leaves the update to Chrome at the next idle stop.
 *
 * There is deliberately no periodic check. It was a 15-minute alarm, re-created on every cold
 * start (so its clock reset and it rarely fired), that woke an idle worker for nothing, and when it
 * did fire on a fresh install it could reload the extension mid-use: its "last check" started at 0,
 * so the first check always looked four hours stale. The alarm itself is cleared on update by the
 * background (see LEGACY_ALARMS in entrypoints/background.ts).
 */

import {
  getUpdateState,
  setUpdateState,
  type UpdateState,
} from '@/platform/storage/updateStorage';
import { whenServicesReady } from '@/platform/serviceReadiness';

/** Extension documents whose presence means someone is using the wallet right now. */
const UI_CONTEXT_TYPES = ['POPUP', 'TAB', 'SIDE_PANEL'] as const;

class UpdateService {
  /** Grace before reloading, and the interval between re-checks while the wallet is in use. */
  private readonly RELOAD_DELAY = 1000 * 30; // 30 seconds

  private state: UpdateState = {
    updateAvailable: false,
    currentVersion: chrome.runtime.getManifest().version,
    reloadScheduled: false
  };

  private criticalOperations = new Set<string>();
  private busyChecks = new Set<() => boolean>();
  private reloadTimeout?: ReturnType<typeof setTimeout>;
  private updateListener: ((details: chrome.runtime.UpdateAvailableDetails) => void) | null = null;

  /**
   * Register the update listener. Synchronous, so the background can call it in its first turn:
   * an update being downloaded can be what wakes the worker, and Chrome delivers that event only
   * to listeners registered by then. The handler waits for initialisation (which loads the state
   * it updates) before acting. If initialisation never finishes, the update is left to Chrome,
   * which applies it the next time the worker stops.
   */
  listen(): void {
    if (!chrome.runtime.onUpdateAvailable || this.updateListener) return;
    this.updateListener = (details) => {
      console.log('[UpdateService] Update available:', details.version);
      whenServicesReady()
        .then(() => this.handleUpdateAvailable(details.version))
        .catch(error => {
          console.error('[UpdateService] Failed to process available update:', error);
        });
    };
    chrome.runtime.onUpdateAvailable.addListener(this.updateListener);
  }

  async initialize(): Promise<void> {
    console.log('[UpdateService] Initializing...');

    // Load previous state
    await this.loadState();

    // Normally already registered by the background's first turn; idempotent.
    this.listen();

    // Check for version changes after reload
    await this.checkVersionAfterReload();

    // A reload that was waiting for the wallet to go idle when the previous worker stopped. Chrome
    // announces an update once, so nothing else would ever pick it up again.
    if (this.state.reloadScheduled) {
      console.log('[UpdateService] Resuming the update reload scheduled before the worker stopped');
      this.scheduleReload();
    }

    console.log('[UpdateService] Initialized with version:', this.state.currentVersion);
  }

  /**
   * Register a critical operation that should block reload
   */
  registerCriticalOperation(operationId: string): void {
    this.criticalOperations.add(operationId);
    console.log(`[UpdateService] Critical operation registered: ${operationId}`);
  }

  /**
   * Unregister a critical operation
   */
  unregisterCriticalOperation(operationId: string): void {
    this.criticalOperations.delete(operationId);
    console.log(`[UpdateService] Critical operation completed: ${operationId}`);

    // If we were waiting to reload and no more critical operations, proceed
    if (this.state.reloadScheduled && this.criticalOperations.size === 0) {
      this.scheduleReload();
    }
  }

  /**
   * Add a check that reports the wallet busy (for example, an approval waiting on the user).
   * A reload waits while any check returns true.
   */
  addBusyCheck(check: () => boolean): void {
    this.busyChecks.add(check);
  }

  /**
   * Handle update available event
   */
  private async handleUpdateAvailable(version: string): Promise<void> {
    this.state.updateAvailable = true;
    this.state.pendingVersion = version;
    this.state.reloadScheduled = true;
    await this.saveState();

    console.log(`[UpdateService] Update to ${version} available, reloading once the wallet is idle`);
    if (this.criticalOperations.size === 0) this.scheduleReload();
  }

  /**
   * Reload after a short delay, if by then nothing is in use; otherwise look again later.
   */
  private scheduleReload(): void {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }

    this.reloadTimeout = setTimeout(() => {
      this.reloadTimeout = undefined;
      void this.reloadIfIdle().catch(error => {
        console.error('[UpdateService] Reload check failed:', error);
        this.scheduleReload();
      });
    }, this.RELOAD_DELAY);
  }

  private async reloadIfIdle(): Promise<void> {
    if (await this.isBusy()) {
      console.log('[UpdateService] Wallet in use; postponing the update reload');
      this.scheduleReload();
      return;
    }
    console.log('[UpdateService] Reloading extension for update...');
    // Cleared first so a reload that does not apply the update (none was really pending any more)
    // cannot resume into another reload on every wake.
    this.state.reloadScheduled = false;
    await this.saveState();
    chrome.runtime.reload();
  }

  /**
   * Whether reloading now would cut someone off: a signing request in flight, an approval waiting,
   * or any extension page open (popup, tab, approval window, side panel).
   */
  async isBusy(): Promise<boolean> {
    if (this.criticalOperations.size > 0) return true;
    for (const check of this.busyChecks) {
      if (check()) return true;
    }
    if (typeof chrome.runtime.getContexts !== 'function') {
      // Cannot see whether a page is open. Leave the update to Chrome, which applies it when the
      // worker next stops, rather than guess.
      return true;
    }
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [...UI_CONTEXT_TYPES] as chrome.runtime.ContextType[],
    });
    return contexts.length > 0;
  }

  /**
   * Check if version changed after reload (to avoid reload loops)
   */
  private async checkVersionAfterReload(): Promise<void> {
    const currentVersion = chrome.runtime.getManifest().version;

    if (this.state.pendingVersion && currentVersion === this.state.pendingVersion) {
      console.log(`[UpdateService] Successfully updated to version ${currentVersion}`);

      // Reset state
      this.state.updateAvailable = false;
      this.state.pendingVersion = undefined;
      this.state.reloadScheduled = false;
      this.state.currentVersion = currentVersion;

      await this.saveState();
    } else if (this.state.currentVersion !== currentVersion) {
      console.log(`[UpdateService] Version changed from ${this.state.currentVersion} to ${currentVersion}`);
      this.state.currentVersion = currentVersion;
      await this.saveState();
    }
  }

  /**
   * Load state from storage
   */
  private async loadState(): Promise<void> {
    const stored = await getUpdateState();
    if (stored) {
      this.state = { ...this.state, ...stored };
    }
  }

  /**
   * Save state to storage
   */
  private async saveState(): Promise<void> {
    await setUpdateState(this.state);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
      this.reloadTimeout = undefined;
    }

    if (this.updateListener) {
      chrome.runtime.onUpdateAvailable?.removeListener(this.updateListener);
      this.updateListener = null;
    }

    this.criticalOperations.clear();
    this.busyChecks.clear();
    console.log('[UpdateService] Destroyed');
  }
}

// Singleton instance
let updateServiceInstance: UpdateService | null = null;

export function getUpdateService(): UpdateService {
  if (!updateServiceInstance) {
    updateServiceInstance = new UpdateService();
  }
  return updateServiceInstance;
}

export { UpdateService, type UpdateState };
