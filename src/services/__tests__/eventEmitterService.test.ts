import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitterService } from '../eventEmitterService';

// Arbitrary names exercise the reusable emitter without widening production wallet contracts.
const eventEmitterService = new EventEmitterService<Record<string, unknown>>();

describe('EventEmitterService', () => {
  beforeEach(() => {
    eventEmitterService.clear();
  });

  afterEach(() => {
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

    it('observes asynchronous listener rejections without delaying other listeners', async () => {
      const failure = new Error('Asynchronous listener failed');
      const report = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goodCallback = vi.fn();
      eventEmitterService.on('test-event', async () => { throw failure; });
      eventEmitterService.on('test-event', goodCallback);

      eventEmitterService.emit('test-event', 'data');
      expect(goodCallback).toHaveBeenCalledWith('data');
      await Promise.resolve();
      expect(report).toHaveBeenCalledWith(
        '[EventEmitter] Error in event listener for test-event:', failure,
      );
      report.mockRestore();
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

      expect((eventEmitterService as unknown as { listeners: Map<string, unknown> }).listeners.has('test-event')).toBe(false);
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
