/**
 * ServiceRegistry - Centralized service management
 * 
 * Provides:
 * - Service registration and retrieval
 * - Dependency injection
 * - Lifecycle management for all services
 * - Health monitoring across services
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
   * Services are initialized in the order they are registered
   */
  async register(service: BaseService): Promise<void> {
    if (this.destroyed) {
      throw new Error('Cannot register services after registry has been destroyed');
    }

    const name = service.getServiceName();
    
    if (this.services.has(name)) {
      throw new Error(`Service ${name} is already registered`);
    }

    try {
      // Initialize the service
      await service.initialize();
      
      // Add to registry
      this.services.set(name, service);
      this.initializationOrder.push(name);
      
      console.log(`Service ${name} registered successfully`);
    } catch (error) {
      console.error(`Failed to register service ${name}:`, error);
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
      console.warn('ServiceRegistry already destroyed');
      return;
    }

    console.log('Destroying all services...');
    
    // Destroy in reverse order of initialization
    const reverseOrder = [...this.initializationOrder].reverse();
    
    for (const name of reverseOrder) {
      const service = this.services.get(name);
      if (service) {
        try {
          await service.destroy();
          console.log(`Service ${name} destroyed`);
        } catch (error) {
          console.error(`Failed to destroy service ${name}:`, error);
        }
      }
    }
    
    // Clear the registry
    this.services.clear();
    this.initializationOrder = [];
    this.destroyed = true;
    
    // Clear the singleton instance
    ServiceRegistry.instance = null;
    
    console.log('All services destroyed');
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
      
      console.log(`Service ${name} reinitialized successfully`);
    } catch (error) {
      console.error(`Failed to reinitialize service ${name}:`, error);
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