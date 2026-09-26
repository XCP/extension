/**
 * BaseService - Foundation for all extension services
 *
 * Provides:
 * - Service lifecycle management (initialize, destroy)
 * - State restore on initialize, and save on destroy or whenever a service calls saveState()
 * - Dependency declaration for explicit initialization ordering
 *
 * ### No periodic persistence
 *
 * Services used to save their state from a 5-minute alarm. A periodic alarm wakes an idle worker
 * whether or not there is anything to save: about 288 cold starts a day, each re-running the
 * whole startup, to store listener names nothing read. A service whose state matters across a
 * restart saves it when the state changes (saveState is protected for exactly that); one whose
 * state does not, does not persist it.
 *
 * ## Architecture Decision Records
 *
 * ### Design note: Explicit Service Dependency Ordering
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
} from '@/platform/storage/serviceStateStorage';

export abstract class BaseService {
  protected readonly serviceName: string;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private destroyPromise: Promise<void> | null = null;
  protected serviceStartTime: number = 0;

  /**
   * @param serviceName Unique identifier for this service (must be non-empty)
   * @throws Error if serviceName is empty or whitespace-only
   */
  constructor(serviceName: string) {
    if (!serviceName || !serviceName.trim()) {
      throw new Error('Service name must be non-empty');
    }
    this.serviceName = serviceName;
  }

  /**
   * Initialize the service
   * - Restores persisted state
   */
  async initialize(): Promise<void> {
    // Already initialized
    if (this.initialized) {
      return;
    }

    // Wait for destroy to complete if in progress
    if (this.destroyPromise) {
      await this.destroyPromise;
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

      // Call service-specific initialization
      await this.onInitialize();

      this.initialized = true;
      console.log(`[${this.serviceName}] Initialized successfully`);
    } catch (error) {
      // Clear promise so initialization can be retried
      this.initializationPromise = null;
      console.error(`[${this.serviceName}] Failed to initialize:`, error);
      throw error;
    }
  }

  /**
   * Destroy the service
   * - Saves current state
   * - Performs service-specific cleanup
   */
  async destroy(): Promise<void> {
    // Wait for initialization to complete if in progress
    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
      } catch {
        // Initialization failed, nothing to destroy
        return;
      }
    }

    if (!this.initialized) {
      return;
    }

    // Destroy already in progress - await existing promise
    if (this.destroyPromise) {
      return this.destroyPromise;
    }

    // Start destruction and store promise to prevent concurrent calls
    this.destroyPromise = this.doDestroy();
    return this.destroyPromise;
  }

  private async doDestroy(): Promise<void> {
    try {
      // Save current state before destruction
      await this.saveState();

      // Call service-specific cleanup
      await this.onDestroy();

      this.initialized = false;
      // Clear promises to allow re-initialization
      this.initializationPromise = null;
      this.destroyPromise = null;
      console.log(`[${this.serviceName}] Destroyed successfully`);
    } catch (error) {
      // Clear destroy promise so destruction can be retried
      this.destroyPromise = null;
      console.error(`[${this.serviceName}] Failed to destroy:`, error);
      throw error;
    }
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
      console.log(`[${this.serviceName}] State restored`);
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
