import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getServiceState,
  setServiceState,
  serviceKeepAlive,
} from '../serviceStateStorage';

describe('serviceStateStorage.ts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('getServiceState', () => {
    it('should return null when no state exists', async () => {
      const result = await getServiceState('TestService', 1);
      expect(result).toBeNull();
    });

    it('should return null for version mismatch', async () => {
      await setServiceState('TestService', { foo: 'bar' }, 1);

      // Request different version
      const result = await getServiceState('TestService', 2);
      expect(result).toBeNull();
    });

    it('should return state for matching version', async () => {
      const state = { count: 42, items: ['a', 'b'] };
      await setServiceState('TestService', state, 1);

      const result = await getServiceState('TestService', 1);
      expect(result).toEqual(state);
    });
  });

  describe('setServiceState', () => {
    it('should store service state', async () => {
      const state = { initialized: true, data: [1, 2, 3] };
      await setServiceState('MyService', state, 1);

      const result = await getServiceState('MyService', 1);
      expect(result).toEqual(state);
    });

    it('should overwrite existing state', async () => {
      await setServiceState('MyService', { value: 'old' }, 1);
      await setServiceState('MyService', { value: 'new' }, 1);

      const result = await getServiceState('MyService', 1);
      expect(result).toEqual({ value: 'new' });
    });

    it('should store state with updated version', async () => {
      await setServiceState('MyService', { v: 1 }, 1);
      await setServiceState('MyService', { v: 2 }, 2);

      // Old version returns null
      expect(await getServiceState('MyService', 1)).toBeNull();

      // New version returns data
      expect(await getServiceState('MyService', 2)).toEqual({ v: 2 });
    });

    it('should handle complex state objects', async () => {
      const complexState = {
        nested: {
          deeply: {
            value: 'test',
          },
        },
        array: [1, 2, { three: 3 }],
        boolean: true,
        number: 123.456,
        nullValue: null,
      };

      await setServiceState('ComplexService', complexState, 1);
      const result = await getServiceState('ComplexService', 1);

      expect(result).toEqual(complexState);
    });
  });

  describe('Multiple services', () => {
    it('should store state for different services independently', async () => {
      await setServiceState('ServiceA', { name: 'A' }, 1);
      await setServiceState('ServiceB', { name: 'B' }, 1);
      await setServiceState('ServiceC', { name: 'C' }, 2);

      expect(await getServiceState('ServiceA', 1)).toEqual({ name: 'A' });
      expect(await getServiceState('ServiceB', 1)).toEqual({ name: 'B' });
      expect(await getServiceState('ServiceC', 2)).toEqual({ name: 'C' });
    });

    it('should not affect other services when updating one', async () => {
      await setServiceState('ServiceA', { value: 'original' }, 1);
      await setServiceState('ServiceB', { value: 'keep' }, 1);

      await setServiceState('ServiceA', { value: 'updated' }, 1);

      expect(await getServiceState('ServiceA', 1)).toEqual({ value: 'updated' });
      expect(await getServiceState('ServiceB', 1)).toEqual({ value: 'keep' });
    });
  });

  describe('serviceKeepAlive', () => {
    it('should complete without error', async () => {
      await expect(serviceKeepAlive('TestService')).resolves.not.toThrow();
    });

    it('should work for any service name', async () => {
      await expect(serviceKeepAlive('Service1')).resolves.not.toThrow();
      await expect(serviceKeepAlive('Service2')).resolves.not.toThrow();
      await expect(serviceKeepAlive('LongServiceName')).resolves.not.toThrow();
    });
  });

  describe('version migrations', () => {
    it('should support version bump for schema changes', async () => {
      // V1 state
      await setServiceState('MigratingService', { oldField: 'data' }, 1);

      // V1 retrieval works
      expect(await getServiceState('MigratingService', 1)).toEqual({ oldField: 'data' });

      // V2 retrieval returns null (incompatible)
      expect(await getServiceState('MigratingService', 2)).toBeNull();

      // Store V2 state
      await setServiceState('MigratingService', { newField: 'data', version: 2 }, 2);

      // Now V2 works, V1 returns null
      expect(await getServiceState('MigratingService', 1)).toBeNull();
      expect(await getServiceState('MigratingService', 2)).toEqual({ newField: 'data', version: 2 });
    });
  });

  describe('primitive and edge case values', () => {
    it('should handle null state', async () => {
      await setServiceState('NullService', null, 1);
      const result = await getServiceState('NullService', 1);
      expect(result).toBeNull();
    });

    it('should handle string state', async () => {
      await setServiceState('StringService', 'just a string', 1);
      const result = await getServiceState('StringService', 1);
      expect(result).toBe('just a string');
    });

    it('should handle number state', async () => {
      await setServiceState('NumberService', 42, 1);
      const result = await getServiceState('NumberService', 1);
      expect(result).toBe(42);
    });

    it('should handle boolean state', async () => {
      await setServiceState('BoolService', true, 1);
      const result = await getServiceState('BoolService', 1);
      expect(result).toBe(true);
    });

    it('should handle empty object state', async () => {
      await setServiceState('EmptyService', {}, 1);
      const result = await getServiceState('EmptyService', 1);
      expect(result).toEqual({});
    });

    it('should handle empty array state', async () => {
      await setServiceState('ArrayService', [], 1);
      const result = await getServiceState('ArrayService', 1);
      expect(result).toEqual([]);
    });
  });
});
