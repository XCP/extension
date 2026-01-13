/**
 * ServiceRegistry - Centralized service management
 *
 * Provides:
 * - Service registration and retrieval
 * - Dependency validation and ordering
 * - Lifecycle management for all services
 * - Health monitoring across services
 *
 * ## Dependency Management
 *
 * Services declare dependencies via `getDependencies()` in BaseService.
 * The registry validates that all dependencies are registered before
 * allowing a new service to register. This ensures explicit initialization
 * ordering and catches misconfiguration early.
 *
 * Example registration order:
 * ```typescript
 * // Correct: EventEmitter has no deps, registers first
 * await registry.register(eventEmitterService);
 * // Correct: ApprovalService depends on EventEmitter, registers second
 * await registry.register(approvalService);
 * ```
 */

import { BaseService } from './BaseService';

export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null;
  private services = new Map<string, BaseService>();
  private initializationOrder: string[] = [];
  private destroyed = false;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance of ServiceRegistry
   */
  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register a service with the registry
   * Validates dependencies are registered before allowing registration.
   * Services are initialized in the order they are registered.
   */
  async register(service: BaseService): Promise<void> {
    if (this.destroyed) {
      throw new Error('Cannot register services after registry has been destroyed');
    }

    const name = service.getServiceName();

    if (this.services.has(name)) {
      throw new Error(`Service ${name} is already registered`);
    }

    // Validate dependencies are registered
    const dependencies = service.getDependencies();
    const missingDeps = dependencies.filter(dep => !this.services.has(dep));

    if (missingDeps.length > 0) {
      throw new Error(
        `Cannot register ${name}: missing dependencies [${missingDeps.join(', ')}]. ` +
        `Register these services first.`
      );
    }

    try {
      // Initialize the service
      await service.initialize();

      // Add to registry
      this.services.set(name, service);
      this.initializationOrder.push(name);

      console.log(`[ServiceRegistry] Registered ${name} (deps: ${dependencies.length > 0 ? dependencies.join(', ') : 'none'})`);
    } catch (error) {
      console.error(`[ServiceRegistry] Failed to register ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get a service by name with type safety
   */
  get<T extends BaseService>(name: string): T {
    const service = this.services.get(name);
    
    if (!service) {
      throw new Error(`Service ${name} not found in registry`);
    }
    
    if (!service.isInitialized()) {
      throw new Error(`Service ${name} is not initialized`);
    }
    
    return service as T;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get a service if it exists, otherwise return null
   */
  tryGet<T extends BaseService>(name: string): T | null {
    try {
      return this.get<T>(name);
    } catch {
      return null;
    }
  }

  /**
   * Destroy all services in reverse order of initialization
   */
  async destroyAll(): Promise<void> {
    if (this.destroyed) {
      console.warn('[ServiceRegistry] Already destroyed');
      return;
    }

    console.log('[ServiceRegistry] Destroying all services...');
    
    // Destroy in reverse order of initialization
    const reverseOrder = [...this.initializationOrder].reverse();
    
    for (const name of reverseOrder) {
      const service = this.services.get(name);
      if (service) {
        try {
          await service.destroy();
          console.log(`[ServiceRegistry] Destroyed ${name}`);
        } catch (error) {
          console.error(`[ServiceRegistry] Failed to destroy ${name}:`, error);
        }
      }
    }
    
    // Clear the registry
    this.services.clear();
    this.initializationOrder = [];
    this.destroyed = true;
    
    // Clear the singleton instance
    ServiceRegistry.instance = null;
    
    console.log('[ServiceRegistry] All services destroyed');
  }


  /**
   * Reinitialize a specific service
   * Useful for recovering from failures
   */
  async reinitializeService(name: string): Promise<void> {
    const service = this.services.get(name);
    
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }
    
    try {
      // Destroy the service first
      await service.destroy();
      
      // Re-initialize it
      await service.initialize();
      
      console.log(`[ServiceRegistry] Reinitialized ${name}`);
    } catch (error) {
      console.error(`[ServiceRegistry] Failed to reinitialize ${name}:`, error);
      throw error;
    }
  }

  /**
   * Check if the registry has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get the dependency graph for all registered services
   * Useful for debugging and documentation
   */
  getDependencyGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [name, service] of this.services) {
      graph[name] = service.getDependencies();
    }
    return graph;
  }

  /**
   * Get initialization order with dependencies
   * Returns a readable representation of service init order
   */
  getInitializationSummary(): string {
    const lines = this.initializationOrder.map((name, index) => {
      const service = this.services.get(name);
      const deps = service?.getDependencies() || [];
      const depStr = deps.length > 0 ? ` (depends on: ${deps.join(', ')})` : '';
      return `${index + 1}. ${name}${depStr}`;
    });
    return lines.join('\n');
  }

  /**
   * Reset the registry (mainly for testing)
   * This will destroy all services and reset the singleton
   */
  static async reset(): Promise<void> {
    if (ServiceRegistry.instance) {
      await ServiceRegistry.instance.destroyAll();
    }
    ServiceRegistry.instance = null;
  }
}