import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getUpdateState,
  setUpdateState,
  clearUpdateState,
  type UpdateState,
} from '../updateStorage';

describe('updateStorage.ts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('getUpdateState', () => {
    it('should return null when no state exists', async () => {
      const result = await getUpdateState();
      expect(result).toBeNull();
    });
  });

  describe('setUpdateState', () => {
    it('should store update state', async () => {
      const state: UpdateState = {
        updateAvailable: false,
        currentVersion: '1.0.0',
        lastCheckTime: 1000000,
        reloadScheduled: false,
      };

      await setUpdateState(state);
      const result = await getUpdateState();

      expect(result).toEqual(state);
    });

    it('should store state with pending version', async () => {
      const state: UpdateState = {
        updateAvailable: true,
        currentVersion: '1.0.0',
        pendingVersion: '1.1.0',
        lastCheckTime: 1000000,
        reloadScheduled: true,
      };

      await setUpdateState(state);
      const result = await getUpdateState();

      expect(result).toEqual(state);
      expect(result!.pendingVersion).toBe('1.1.0');
    });

    it('should overwrite existing state', async () => {
      const original: UpdateState = {
        updateAvailable: false,
        currentVersion: '1.0.0',
        lastCheckTime: 1000000,
        reloadScheduled: false,
      };

      const updated: UpdateState = {
        updateAvailable: true,
        currentVersion: '1.0.0',
        pendingVersion: '1.1.0',
        lastCheckTime: 2000000,
        reloadScheduled: true,
      };

      await setUpdateState(original);
      await setUpdateState(updated);

      const result = await getUpdateState();
      expect(result).toEqual(updated);
    });
  });

  describe('clearUpdateState', () => {
    it('should clear existing state', async () => {
      const state: UpdateState = {
        updateAvailable: true,
        currentVersion: '1.0.0',
        lastCheckTime: 1000000,
        reloadScheduled: false,
      };

      await setUpdateState(state);
      expect(await getUpdateState()).not.toBeNull();

      await clearUpdateState();

      expect(await getUpdateState()).toBeNull();
    });

    it('should handle clearing non-existent state', async () => {
      await expect(clearUpdateState()).resolves.not.toThrow();
    });
  });

  describe('update lifecycle', () => {
    it('should track update detection and installation', async () => {
      // 1. Initial state - no updates
      const initialState: UpdateState = {
        updateAvailable: false,
        currentVersion: '1.0.0',
        lastCheckTime: Date.now(),
        reloadScheduled: false,
      };
      await setUpdateState(initialState);

      // 2. Update detected
      const updateDetected: UpdateState = {
        updateAvailable: true,
        currentVersion: '1.0.0',
        pendingVersion: '1.1.0',
        lastCheckTime: Date.now(),
        reloadScheduled: false,
      };
      await setUpdateState(updateDetected);

      let state = await getUpdateState();
      expect(state!.updateAvailable).toBe(true);
      expect(state!.pendingVersion).toBe('1.1.0');

      // 3. Reload scheduled
      const reloadScheduled: UpdateState = {
        ...updateDetected,
        reloadScheduled: true,
      };
      await setUpdateState(reloadScheduled);

      state = await getUpdateState();
      expect(state!.reloadScheduled).toBe(true);

      // 4. After reload with new version
      const afterUpdate: UpdateState = {
        updateAvailable: false,
        currentVersion: '1.1.0',
        lastCheckTime: Date.now(),
        reloadScheduled: false,
      };
      await setUpdateState(afterUpdate);

      state = await getUpdateState();
      expect(state!.currentVersion).toBe('1.1.0');
      expect(state!.updateAvailable).toBe(false);
      expect(state!.pendingVersion).toBeUndefined();
    });
  });

  describe('version formats', () => {
    it('should handle semver versions', async () => {
      const state: UpdateState = {
        updateAvailable: true,
        currentVersion: '2.1.3',
        pendingVersion: '2.2.0',
        lastCheckTime: 1000000,
        reloadScheduled: false,
      };

      await setUpdateState(state);
      const result = await getUpdateState();

      expect(result!.currentVersion).toBe('2.1.3');
      expect(result!.pendingVersion).toBe('2.2.0');
    });

    it('should handle pre-release versions', async () => {
      const state: UpdateState = {
        updateAvailable: true,
        currentVersion: '1.0.0-beta.1',
        pendingVersion: '1.0.0-beta.2',
        lastCheckTime: 1000000,
        reloadScheduled: false,
      };

      await setUpdateState(state);
      const result = await getUpdateState();

      expect(result!.currentVersion).toBe('1.0.0-beta.1');
    });
  });

  describe('timestamp handling', () => {
    it('should preserve lastCheckTime accurately', async () => {
      const checkTime = 1609459200000; // Fixed timestamp

      const state: UpdateState = {
        updateAvailable: false,
        currentVersion: '1.0.0',
        lastCheckTime: checkTime,
        reloadScheduled: false,
      };

      await setUpdateState(state);
      const result = await getUpdateState();

      expect(result!.lastCheckTime).toBe(checkTime);
    });

    it('should update lastCheckTime on periodic checks', async () => {
      const firstCheck: UpdateState = {
        updateAvailable: false,
        currentVersion: '1.0.0',
        lastCheckTime: 1000000,
        reloadScheduled: false,
      };
      await setUpdateState(firstCheck);

      const secondCheck: UpdateState = {
        ...firstCheck,
        lastCheckTime: 2000000,
      };
      await setUpdateState(secondCheck);

      const result = await getUpdateState();
      expect(result!.lastCheckTime).toBe(2000000);
    });
  });
});
