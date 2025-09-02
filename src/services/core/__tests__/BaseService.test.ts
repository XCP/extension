/**
 * BaseService Unit Tests
 * 
 * Tests the base service functionality including lifecycle, persistence, and health monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseService } from '../BaseService';

// Create a concrete test implementation of BaseService
class TestService extends BaseService {
  private testData: { value: number } = { value: 0 };

  constructor(serviceName: string = 'TestService') {
    super(serviceName);
  }

  // Public method to modify internal state for testing
  public setTestValue(value: number): void {
    this.testData.value = value;
  }

  public getTestValue(): number {
    return this.testData.value;
  }


  // Implement abstract methods
  protected async onInitialize(): Promise<void> {
    // Test-specific initialization
  }

  protected async onDestroy(): Promise<void> {
    // Test-specific cleanup
  }

  protected getStateVersion(): number {
    return 1;
  }

  protected getSerializableState(): any {
    return {
      testData: this.testData,
    };
  }

  protected hydrateState(state: any): void {
    if (state?.testData) {
      this.testData = state.testData;
    }
  }

}

// Mock chrome storage
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
};

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  
  global.chrome = {
    storage: {
      local: mockStorage,
      session: mockStorage,
    },
    alarms: {
      create: vi.fn(),
      onAlarm: {
        addListener: vi.fn(),
      },
    },
  } as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BaseService', () => {
  let testService: TestService;

  beforeEach(async () => {
    testService = new TestService();
    
    // Mock initial storage state
    mockStorage.get.mockResolvedValue({});
  });

  afterEach(async () => {
    if (testService) {
      await testService.destroy();
    }
  });

  describe('lifecycle management', () => {
    it('should initialize service successfully', async () => {
      await testService.initialize();
      
      expect(testService.isInitialized()).toBe(true);
      expect(mockStorage.get).toHaveBeenCalledWith('testserviceState');
    });

    it('should restore state during initialization', async () => {
      // Mock saved state
      const savedState = {
        testData: { value: 42 },
      };
      mockStorage.get.mockResolvedValue({ testserviceState: savedState });
      
      await testService.initialize();
      
      expect(testService.getTestValue()).toBe(42);
    });

    it('should handle initialization errors gracefully', async () => {
      mockStorage.get.mockRejectedValue(new Error('Storage error'));
      
      // Should not throw
      await testService.initialize();
      
      expect(testService.isInitialized()).toBe(true);
      expect(testService.getTestValue()).toBe(0); // Default value
    });

    it('should destroy service and cleanup resources', async () => {
      await testService.initialize();
      testService.setTestValue(123);
      
      await testService.destroy();
      
      expect(testService.isInitialized()).toBe(false);
      expect(mockStorage.set).toHaveBeenCalledWith({
        testserviceState: {
          testData: { value: 123 },
        },
      });
    });

    it('should prevent double initialization', async () => {
      await testService.initialize();
      
      // Second initialization should not do anything
      await testService.initialize();
      
      // Storage should only be read once
      expect(mockStorage.get).toHaveBeenCalledTimes(1);
    });

    it('should handle destroy on uninitialized service', async () => {
      // Should not throw
      await testService.destroy();
      
      expect(testService.isInitialized()).toBe(false);
      expect(mockStorage.set).not.toHaveBeenCalled();
    });
  });

  describe('state persistence', () => {
    it('should persist state periodically', async () => {
      await testService.initialize();
      testService.setTestValue(456);
      
      // Trigger periodic save
      await (testService as any).persistState();
      
      expect(mockStorage.set).toHaveBeenCalledWith({
        testserviceState: {
          testData: { value: 456 },
        },
      });
    });

    it('should handle persistence errors gracefully', async () => {
      await testService.initialize();
      mockStorage.set.mockRejectedValue(new Error('Storage full'));
      
      // Should not throw
      await (testService as any).persistState();
    });

    it('should create keep-alive alarm', async () => {
      await testService.initialize();
      
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'TestService-keepalive',
        { periodInMinutes: 0.4 }
      );
    });

    it('should handle alarm events', async () => {
      await testService.initialize();
      
      // Get the alarm listener that was registered
      const alarmListener = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls[0][0];
      
      // Simulate alarm event for this service
      const alarm = { name: 'TestService-keepalive', scheduledTime: Date.now(), periodInMinutes: 0.4 };
      alarmListener(alarm);
      
      // Should trigger keep-alive activity (accessing storage)
      expect(mockStorage.get).toHaveBeenCalled();
    });

    it('should ignore alarm events for other services', async () => {
      await testService.initialize();
      
      const initialStorageCalls = vi.mocked(mockStorage.get).mock.calls.length;
      
      // Get the alarm listener
      const alarmListener = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls[0][0];
      
      // Simulate alarm event for different service
      const alarm = { name: 'OtherService-keepalive', scheduledTime: Date.now(), periodInMinutes: 0.4 };
      alarmListener(alarm);
      
      // Should not trigger additional storage calls
      expect(mockStorage.get).toHaveBeenCalledTimes(initialStorageCalls);
    });
  });


  describe('service metadata', () => {
    it('should track service name and start time', async () => {
      const customService = new TestService('CustomService');
      await customService.initialize();
      
      expect(customService.getServiceName()).toBe('CustomService');
      expect(customService.getStartTime()).toBeGreaterThan(0);
      expect(customService.getStartTime()).toBeLessThanOrEqual(Date.now());
      
      await customService.destroy();
    });

  });

  describe('error handling', () => {
    it('should handle state hydration errors', async () => {
      // Mock corrupted state
      mockStorage.get.mockResolvedValue({
        testserviceState: 'invalid-state', // Not an object
      });
      
      // Should not throw and should use default state
      await testService.initialize();
      
      expect(testService.isInitialized()).toBe(true);
      expect(testService.getTestValue()).toBe(0); // Default value
    });

    it('should handle state serialization errors', async () => {
      await testService.initialize();
      
      // Override getSerializableState to throw
      (testService as any).getSerializableState = vi.fn().mockImplementation(() => {
        throw new Error('Serialization error');
      });
      
      // Should not throw during destroy
      await testService.destroy();
    });
  });

  describe('service version tracking', () => {
    it('should handle state version mismatches', async () => {
      // Mock state with different version
      mockStorage.get.mockResolvedValue({
        testserviceState: {
          _version: 999, // Future version
          testData: { value: 100 },
        },
      });
      
      await testService.initialize();
      
      // Should handle version mismatch gracefully
      expect(testService.isInitialized()).toBe(true);
      // Should use default state when version doesn't match
      expect(testService.getTestValue()).toBe(0);
    });

    it('should include version in serialized state', async () => {
      await testService.initialize();
      testService.setTestValue(789);
      
      await testService.destroy();
      
      const savedState = vi.mocked(mockStorage.set).mock.calls[0][0];
      expect(savedState.testserviceState._version).toBe(1);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent initialization attempts', async () => {
      const promises = [
        testService.initialize(),
        testService.initialize(),
        testService.initialize(),
      ];
      
      await Promise.all(promises);
      
      expect(testService.isInitialized()).toBe(true);
      // Should only read from storage once
      expect(mockStorage.get).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent destroy attempts', async () => {
      await testService.initialize();
      testService.setTestValue(999);
      
      const promises = [
        testService.destroy(),
        testService.destroy(),
        testService.destroy(),
      ];
      
      await Promise.all(promises);
      
      expect(testService.isInitialized()).toBe(false);
      // Should only write to storage once
      expect(mockStorage.set).toHaveBeenCalledTimes(1);
    });
  });
});