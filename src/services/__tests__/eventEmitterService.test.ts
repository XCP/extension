import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { eventEmitterService } from '../eventEmitterService';

describe('EventEmitterService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    eventEmitterService.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    eventEmitterService.clear();
  });

  describe('on / emit', () => {
    it('should register and call event listeners', () => {
      const callback = vi.fn();

      eventEmitterService.on('test-event', callback);
      eventEmitterService.emit('test-event', { foo: 'bar' });

      expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('should call multiple listeners for the same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventEmitterService.on('test-event', callback1);
      eventEmitterService.on('test-event', callback2);
      eventEmitterService.emit('test-event', 'data');

      expect(callback1).toHaveBeenCalledWith('data');
      expect(callback2).toHaveBeenCalledWith('data');
    });

    it('should not call listeners for different events', () => {
      const callback = vi.fn();

      eventEmitterService.on('event-a', callback);
      eventEmitterService.emit('event-b', 'data');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle listener errors without affecting others', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodCallback = vi.fn();

      eventEmitterService.on('test-event', errorCallback);
      eventEmitterService.on('test-event', goodCallback);

      // Should not throw
      eventEmitterService.emit('test-event', 'data');

      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('off', () => {
    it('should remove a specific listener', () => {
      const callback = vi.fn();

      eventEmitterService.on('test-event', callback);
      eventEmitterService.off('test-event', callback);
      eventEmitterService.emit('test-event', 'data');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should only remove the specified listener', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventEmitterService.on('test-event', callback1);
      eventEmitterService.on('test-event', callback2);
      eventEmitterService.off('test-event', callback1);
      eventEmitterService.emit('test-event', 'data');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle removing non-existent listener gracefully', () => {
      const callback = vi.fn();

      // Remove listener that was never registered
      expect(() => {
        eventEmitterService.off('test-event', callback);
      }).not.toThrow();
    });

    it('should clean up empty listener sets', () => {
      const callback = vi.fn();

      eventEmitterService.on('test-event', callback);
      eventEmitterService.off('test-event', callback);

      const stats = eventEmitterService.getStats();
      expect(stats.listenersByEvent['test-event']).toBeUndefined();
    });
  });

  describe('emitProviderEvent', () => {
    it('should emit to origin-specific listeners', () => {
      const callback = vi.fn();

      eventEmitterService.on('accountsChanged', callback, 'https://example.com');
      eventEmitterService.emitProviderEvent('https://example.com', 'accountsChanged', ['0x123']);

      expect(callback).toHaveBeenCalledWith(['0x123']);
    });

    it('should not emit to listeners for different origins', () => {
      const callback = vi.fn();

      eventEmitterService.on('accountsChanged', callback, 'https://other.com');
      eventEmitterService.emitProviderEvent('https://example.com', 'accountsChanged', ['0x123']);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should emit to wildcard listeners along with origin', () => {
      const wildcardCallback = vi.fn();

      eventEmitterService.on('accountsChanged', wildcardCallback);
      eventEmitterService.emitProviderEvent('https://example.com', 'accountsChanged', ['0x123']);

      expect(wildcardCallback).toHaveBeenCalledWith(['0x123'], 'https://example.com');
    });

    it('should emit to both origin-specific and wildcard listeners', () => {
      const originCallback = vi.fn();
      const wildcardCallback = vi.fn();

      eventEmitterService.on('accountsChanged', originCallback, 'https://example.com');
      eventEmitterService.on('accountsChanged', wildcardCallback);
      eventEmitterService.emitProviderEvent('https://example.com', 'accountsChanged', ['0x123']);

      expect(originCallback).toHaveBeenCalledWith(['0x123']);
      expect(wildcardCallback).toHaveBeenCalledWith(['0x123'], 'https://example.com');
    });

    it('should emit to all listeners when origin is null', () => {
      const callback = vi.fn();

      eventEmitterService.on('globalEvent', callback);
      eventEmitterService.emitProviderEvent(null, 'globalEvent', 'data');

      expect(callback).toHaveBeenCalledWith('data');
    });
  });

  describe('onWithTimeout', () => {
    it('should register a listener with timeout', () => {
      const callback = vi.fn();

      eventEmitterService.onWithTimeout('test-event', callback, 1000);
      eventEmitterService.emit('test-event', 'data');

      expect(callback).toHaveBeenCalledWith('data');
    });

    it('should auto-cleanup listener after timeout', () => {
      const callback = vi.fn();

      eventEmitterService.onWithTimeout('test-event', callback, 1000);

      // Advance past timeout
      vi.advanceTimersByTime(1001);

      // Listener should be removed
      eventEmitterService.emit('test-event', 'data');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not auto-cleanup before timeout', () => {
      const callback = vi.fn();

      eventEmitterService.onWithTimeout('test-event', callback, 1000);

      // Advance but not past timeout
      vi.advanceTimersByTime(999);

      eventEmitterService.emit('test-event', 'data');

      expect(callback).toHaveBeenCalled();
    });

    it('should clear timeout when manually removed', () => {
      const callback = vi.fn();

      eventEmitterService.onWithTimeout('test-event', callback, 1000);
      eventEmitterService.off('test-event', callback);

      // Advance past original timeout
      vi.advanceTimersByTime(1001);

      // Should have no effect since we already removed it
      eventEmitterService.emit('test-event', 'data');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should track timed listeners in stats', () => {
      const callback = vi.fn();

      eventEmitterService.onWithTimeout('test-event', callback, 1000);

      const stats = eventEmitterService.getStats();
      expect(stats.timedListenerCount).toBe(1);
    });
  });

  describe('pendingRequests', () => {
    it('should store and resolve pending requests', () => {
      const resolver = vi.fn();

      eventEmitterService.setPendingRequest('req-1', resolver);
      const resolved = eventEmitterService.resolvePendingRequest('req-1', { result: 'success' });

      expect(resolved).toBe(true);
      expect(resolver).toHaveBeenCalledWith({ result: 'success' });
    });

    it('should return false for non-existent request', () => {
      const resolved = eventEmitterService.resolvePendingRequest('non-existent', 'value');

      expect(resolved).toBe(false);
    });

    it('should remove request after resolving', () => {
      const resolver = vi.fn();

      eventEmitterService.setPendingRequest('req-1', resolver);
      eventEmitterService.resolvePendingRequest('req-1', 'value');

      // Second resolve should fail
      const resolved = eventEmitterService.resolvePendingRequest('req-1', 'value2');
      expect(resolved).toBe(false);
      expect(resolver).toHaveBeenCalledTimes(1);
    });

    it('should clear pending request without resolving', () => {
      const resolver = vi.fn();

      eventEmitterService.setPendingRequest('req-1', resolver);
      eventEmitterService.clearPendingRequest('req-1');

      const resolved = eventEmitterService.resolvePendingRequest('req-1', 'value');
      expect(resolved).toBe(false);
      expect(resolver).not.toHaveBeenCalled();
    });

    it('should track pending request count', () => {
      eventEmitterService.setPendingRequest('req-1', vi.fn());
      eventEmitterService.setPendingRequest('req-2', vi.fn());
      eventEmitterService.setPendingRequest('req-3', vi.fn());

      expect(eventEmitterService.getPendingRequestCount()).toBe(3);

      eventEmitterService.resolvePendingRequest('req-2', 'value');
      expect(eventEmitterService.getPendingRequestCount()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventEmitterService.on('event-1', callback1);
      eventEmitterService.on('event-2', callback2);
      eventEmitterService.clear();

      eventEmitterService.emit('event-1', 'data');
      eventEmitterService.emit('event-2', 'data');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should clear all pending requests', () => {
      eventEmitterService.setPendingRequest('req-1', vi.fn());
      eventEmitterService.setPendingRequest('req-2', vi.fn());

      eventEmitterService.clear();

      expect(eventEmitterService.getPendingRequestCount()).toBe(0);
    });

    it('should clear timed listener timeouts', () => {
      const callback = vi.fn();

      eventEmitterService.onWithTimeout('test-event', callback, 1000);
      eventEmitterService.clear();

      const stats = eventEmitterService.getStats();
      expect(stats.timedListenerCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      eventEmitterService.on('event-1', vi.fn());
      eventEmitterService.on('event-1', vi.fn());
      eventEmitterService.on('event-2', vi.fn());
      eventEmitterService.onWithTimeout('event-3', vi.fn(), 1000);
      eventEmitterService.setPendingRequest('req-1', vi.fn());

      const stats = eventEmitterService.getStats();

      expect(stats.listenerCount).toBe(3); // 3 event keys
      expect(stats.pendingRequestCount).toBe(1);
      expect(stats.timedListenerCount).toBe(1);
      expect(stats.listenersByEvent['event-1']).toBe(2);
      expect(stats.listenersByEvent['event-2']).toBe(1);
      expect(stats.listenersByEvent['event-3']).toBe(1);
    });

    it('should return empty stats when cleared', () => {
      eventEmitterService.clear();

      const stats = eventEmitterService.getStats();

      expect(stats.listenerCount).toBe(0);
      expect(stats.pendingRequestCount).toBe(0);
      expect(stats.timedListenerCount).toBe(0);
      expect(Object.keys(stats.listenersByEvent)).toHaveLength(0);
    });
  });

  describe('BaseService implementation', () => {
    it('should return serializable state', () => {
      eventEmitterService.on('event-1', vi.fn());
      eventEmitterService.setPendingRequest('req-1', vi.fn());

      const state = (eventEmitterService as any).getSerializableState();

      expect(state).toEqual({
        listenerKeys: ['event-1'],
        pendingRequestIds: ['req-1'],
      });
    });

    it('should return null for empty state', () => {
      eventEmitterService.clear();

      const state = (eventEmitterService as any).getSerializableState();

      expect(state).toBeNull();
    });

    it('should have correct state version', () => {
      const version = (eventEmitterService as any).getStateVersion();

      expect(version).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle same callback for multiple events', () => {
      const callback = vi.fn();

      eventEmitterService.on('event-1', callback);
      eventEmitterService.on('event-2', callback);

      eventEmitterService.emit('event-1', 'data1');
      eventEmitterService.emit('event-2', 'data2');

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, 'data1');
      expect(callback).toHaveBeenNthCalledWith(2, 'data2');
    });

    it('should handle registering same callback twice for same event', () => {
      const callback = vi.fn();

      eventEmitterService.on('test-event', callback);
      eventEmitterService.on('test-event', callback);

      eventEmitterService.emit('test-event', 'data');

      // Set prevents duplicates, so should only be called once
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle emitting with no listeners', () => {
      expect(() => {
        eventEmitterService.emit('no-listeners', 'data');
      }).not.toThrow();
    });

    it('should handle various data types', () => {
      const callback = vi.fn();
      eventEmitterService.on('test', callback);

      const testData = [
        null,
        undefined,
        0,
        'string',
        { nested: { deep: true } },
        [1, 2, 3],
        () => {},
      ];

      testData.forEach((data, i) => {
        eventEmitterService.emit('test', data);
        expect(callback).toHaveBeenNthCalledWith(i + 1, data);
      });
    });
  });
});
