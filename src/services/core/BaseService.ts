/**
 * BaseService - Foundation for all extension services
 *
 * Provides:
 * - Service lifecycle management (initialize, destroy)
 * - State persistence for service worker restarts
 * - Keep-alive mechanism to prevent service worker termination
 * - Dependency declaration for explicit initialization ordering
 *
 * ## Architecture Decision Records
 *
 * ### ADR-005: Explicit Service Dependency Ordering
 *
 * **Context**: Services often depend on other services being initialized first.
 * Without explicit ordering, initialization race conditions can occur.
 *
 * **Decision**: Services declare dependencies via `getDependencies()`.
 * ServiceRegistry validates dependencies are registered before allowing registration.
 *
 * **Rationale**:
 * - MetaMask uses ControllerMessenger with restricted actions/events (more complex)
 * - Simple dependency array is sufficient for our use case
 * - Runtime validation catches misconfiguration early
 * - Explicit > implicit ordering
 *
 * **Usage**:
 * ```typescript
 * class MyService extends BaseService {
 *   getDependencies(): string[] {
 *     return ['EventEmitterService']; // Must be registered first
 *   }
 * }
 * ```
 */

import {
  getServiceState,
  setServiceState,
  serviceKeepAlive,
} from '@/utils/storage/serviceStateStorage';

export abstract class BaseService {
  protected readonly serviceName: string;
  private keepAliveAlarmName: string;
  private persistAlarmName: string;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  protected serviceStartTime: number = 0;

  // Static: single shared listener with O(1) dispatch via Map
  private static alarmHandlers = new Map<string, () => Promise<void>>();
  private static listenerRegistered = false;

  private static ensureAlarmListener(): void {
    if (this.listenerRegistered || !chrome?.alarms?.onAlarm) {
      return;
    }
    chrome.alarms.onAlarm.addListener((alarm) => {
      const handler = BaseService.alarmHandlers.get(alarm.name);
      handler?.();
    });
    this.listenerRegistered = true;
  }

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.keepAliveAlarmName = `${serviceName}-keepalive`;
    this.persistAlarmName = `${serviceName}-persist`;
  }

  /**
   * Initialize the service
   * - Restores persisted state
   * - Sets up keep-alive mechanism
   * - Registers alarms for state persistence
   */
  async initialize(): Promise<void> {
    // Already initialized
    if (this.initialized) {
      return;
    }

    // Initialization already in progress - await existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization and store promise to prevent concurrent calls
    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Track service start time
      this.serviceStartTime = Date.now();

      // Restore any persisted state
      await this.restoreState();

      // Set up keep-alive alarm (every 24 seconds to prevent 30s timeout)
      if (chrome?.alarms) {
        await chrome.alarms.create(this.keepAliveAlarmName, {
          periodInMinutes: 0.4, // 24 seconds
        });

        // Set up state persistence alarm (every 5 minutes)
        await chrome.alarms.create(this.persistAlarmName, {
          periodInMinutes: 5,
        });

        // Register handlers in shared static map (O(1) dispatch)
        BaseService.alarmHandlers.set(
          this.keepAliveAlarmName,
          () => this.handleKeepAlive()
        );
        BaseService.alarmHandlers.set(
          this.persistAlarmName,
          () => this.handlePersist()
        );
        BaseService.ensureAlarmListener();
      }

      // Call service-specific initialization
      await this.onInitialize();

      this.initialized = true;
      console.log(`Service ${this.serviceName} initialized successfully`);
    } catch (error) {
      // Clear promise so initialization can be retried
      this.initializationPromise = null;
      console.error(`Failed to initialize service ${this.serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Destroy the service
   * - Saves current state
   * - Cleans up alarms
   * - Performs service-specific cleanup
   */
  async destroy(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Save current state before destruction
      await this.saveState();

      // Clear alarms and remove from shared handler map
      if (chrome?.alarms) {
        await chrome.alarms.clear(this.keepAliveAlarmName);
        await chrome.alarms.clear(this.persistAlarmName);

        // Remove handlers from shared map
        BaseService.alarmHandlers.delete(this.keepAliveAlarmName);
        BaseService.alarmHandlers.delete(this.persistAlarmName);
      }

      // Call service-specific cleanup
      await this.onDestroy();

      this.initialized = false;
      console.log(`Service ${this.serviceName} destroyed successfully`);
    } catch (error) {
      console.error(`Failed to destroy service ${this.serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Handle keep-alive alarm - access storage to prevent service worker termination
   */
  private async handleKeepAlive(): Promise<void> {
    await serviceKeepAlive(this.serviceName);
  }

  /**
   * Handle persist alarm - save current state
   */
  private async handlePersist(): Promise<void> {
    await this.saveState();
  }

  /**
   * Save service state to persistent storage
   */
  protected async saveState(): Promise<void> {
    const state = this.getSerializableState();
    if (state !== null && state !== undefined) {
      await setServiceState(this.serviceName, state, this.getStateVersion());
    }
  }

  /**
   * Restore service state from persistent storage
   */
  protected async restoreState(): Promise<void> {
    const state = await getServiceState(this.serviceName, this.getStateVersion());
    if (state !== null) {
      this.hydrateState(state);
      console.log(`State restored for service ${this.serviceName}`);
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the service name
   */
  getServiceName(): string {
    return this.serviceName;
  }

  /**
   * Get service start time
   */
  getStartTime(): number {
    return this.serviceStartTime;
  }

  /**
   * Get service dependencies - names of services that must be registered first.
   * Override in derived classes to declare dependencies.
   * ServiceRegistry validates these before allowing registration.
   *
   * @returns Array of service names this service depends on
   */
  getDependencies(): string[] {
    return []; // Default: no dependencies
  }

  // Abstract methods that must be implemented by derived services

  /**
   * Service-specific initialization logic
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Service-specific cleanup logic
   */
  protected abstract onDestroy(): Promise<void>;

  /**
   * Get serializable state for persistence
   * Return null if no state needs to be persisted
   */
  protected abstract getSerializableState(): any;

  /**
   * Restore service state from persisted data
   */
  protected abstract hydrateState(state: any): void;

  /**
   * Get the version of the state format
   * Used to handle migrations and compatibility
   */
  protected abstract getStateVersion(): number;
}