/**
 * Update Service - Handles Chrome extension updates for persistent service workers
 *
 * Critical for extensions with:
 * - Native messaging hosts
 * - Persistent connections
 * - Keep-alive mechanisms
 *
 * Without this, Chrome won't auto-update and users get stuck on old versions.
 */

interface UpdateState {
  updateAvailable: boolean;
  currentVersion: string;
  pendingVersion?: string;
  lastCheckTime: number;
  reloadScheduled: boolean;
}

class UpdateService {
  private readonly STORAGE_KEY = 'update_service_state';
  private readonly CHECK_INTERVAL = 1000 * 60 * 15; // 15 minutes
  private readonly CRITICAL_OPERATION_DELAY = 1000 * 30; // 30 seconds

  private state: UpdateState = {
    updateAvailable: false,
    currentVersion: chrome.runtime.getManifest().version,
    lastCheckTime: 0,
    reloadScheduled: false
  };

  private criticalOperations = new Set<string>();
  private reloadTimeout?: NodeJS.Timeout;

  async initialize(): Promise<void> {
    console.log('[UpdateService] Initializing...');

    // Load previous state
    await this.loadState();

    // Set up update listener
    if (chrome.runtime.onUpdateAvailable) {
      chrome.runtime.onUpdateAvailable.addListener((details) => {
        console.log('[UpdateService] Update available:', details.version);
        this.handleUpdateAvailable(details.version);
      });
    }

    // Set up periodic check alarm
    this.setupPeriodicCheck();

    // Check for version changes after reload
    await this.checkVersionAfterReload();

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
   * Handle update available event
   */
  private async handleUpdateAvailable(version: string): Promise<void> {
    this.state.updateAvailable = true;
    this.state.pendingVersion = version;
    await this.saveState();

    console.log(`[UpdateService] Update to ${version} available, scheduling reload...`);

    // If there are critical operations, wait for them
    if (this.criticalOperations.size > 0) {
      console.log(`[UpdateService] Waiting for ${this.criticalOperations.size} critical operations to complete`);
      this.state.reloadScheduled = true;
      await this.saveState();
      return;
    }

    // Otherwise, schedule immediate reload
    this.scheduleReload();
  }

  /**
   * Schedule a reload after a short delay
   */
  private scheduleReload(): void {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }

    console.log(`[UpdateService] Reloading extension in ${this.CRITICAL_OPERATION_DELAY / 1000} seconds...`);

    this.reloadTimeout = setTimeout(() => {
      console.log('[UpdateService] Reloading extension for update...');
      chrome.runtime.reload();
    }, this.CRITICAL_OPERATION_DELAY);
  }

  /**
   * Set up periodic check to catch missed updates
   */
  private setupPeriodicCheck(): void {
    const ALARM_NAME = 'update-service-periodic-check';

    // Create periodic alarm
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: this.CHECK_INTERVAL / (1000 * 60)
    });

    // Listen for alarm
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) {
        this.performPeriodicCheck();
      }
    });
  }

  /**
   * Perform periodic check - reload if we've been running too long
   */
  private async performPeriodicCheck(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCheck = now - this.state.lastCheckTime;

    this.state.lastCheckTime = now;
    await this.saveState();

    // If it's been a while since we checked, consider reloading
    // This catches cases where onUpdateAvailable doesn't fire
    const STALE_THRESHOLD = 1000 * 60 * 60 * 4; // 4 hours

    if (timeSinceLastCheck > STALE_THRESHOLD && this.criticalOperations.size === 0) {
      console.log('[UpdateService] Periodic reload after 4 hours of uptime');
      this.scheduleReload();
    }
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
   * Get current update status
   */
  getStatus(): Readonly<UpdateState> {
    return { ...this.state };
  }

  /**
   * Force a reload (for testing or manual triggers)
   */
  forceReload(): void {
    console.log('[UpdateService] Force reload requested');
    chrome.runtime.reload();
  }

  /**
   * Load state from storage
   */
  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      if (result[this.STORAGE_KEY]) {
        this.state = { ...this.state, ...result[this.STORAGE_KEY] };
      }
    } catch (error) {
      console.error('[UpdateService] Failed to load state:', error);
    }
  }

  /**
   * Save state to storage
   */
  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: this.state
      });
    } catch (error) {
      console.error('[UpdateService] Failed to save state:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }
    this.criticalOperations.clear();
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