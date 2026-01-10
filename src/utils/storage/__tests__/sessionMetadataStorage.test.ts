import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getSessionMetadata,
  setSessionMetadata,
  clearSessionMetadata,
  type SessionMetadata,
} from '../sessionMetadataStorage';

describe('sessionMetadataStorage.ts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('getSessionMetadata', () => {
    it('should return null when no session exists', async () => {
      const result = await getSessionMetadata();
      expect(result).toBeNull();
    });
  });

  describe('setSessionMetadata', () => {
    it('should store session metadata', async () => {
      const metadata: SessionMetadata = {
        unlockedAt: 1000000,
        timeout: 300000, // 5 minutes
        lastActiveTime: 1000000,
      };

      await setSessionMetadata(metadata);
      const result = await getSessionMetadata();

      expect(result).toEqual(metadata);
    });

    it('should overwrite existing metadata', async () => {
      const original: SessionMetadata = {
        unlockedAt: 1000000,
        timeout: 300000,
        lastActiveTime: 1000000,
      };

      const updated: SessionMetadata = {
        unlockedAt: 1000000,
        timeout: 300000,
        lastActiveTime: 1100000, // Updated
      };

      await setSessionMetadata(original);
      await setSessionMetadata(updated);

      const result = await getSessionMetadata();
      expect(result).toEqual(updated);
    });
  });

  describe('clearSessionMetadata', () => {
    it('should clear existing metadata', async () => {
      const metadata: SessionMetadata = {
        unlockedAt: 1000000,
        timeout: 300000,
        lastActiveTime: 1000000,
      };

      await setSessionMetadata(metadata);
      expect(await getSessionMetadata()).not.toBeNull();

      await clearSessionMetadata();

      expect(await getSessionMetadata()).toBeNull();
    });

    it('should handle clearing non-existent metadata', async () => {
      // Should not throw
      await expect(clearSessionMetadata()).resolves.not.toThrow();
    });
  });

  describe('session lifecycle', () => {
    it('should support full session lifecycle', async () => {
      // 1. No session initially
      expect(await getSessionMetadata()).toBeNull();

      // 2. Create session (wallet unlock)
      const unlockTime = Date.now();
      const metadata: SessionMetadata = {
        unlockedAt: unlockTime,
        timeout: 300000,
        lastActiveTime: unlockTime,
      };
      await setSessionMetadata(metadata);

      // 3. Verify session exists
      const session = await getSessionMetadata();
      expect(session).not.toBeNull();
      expect(session!.unlockedAt).toBe(unlockTime);

      // 4. Update activity time
      const updatedMetadata: SessionMetadata = {
        ...metadata,
        lastActiveTime: unlockTime + 60000, // 1 minute later
      };
      await setSessionMetadata(updatedMetadata);

      const updated = await getSessionMetadata();
      expect(updated!.lastActiveTime).toBe(unlockTime + 60000);

      // 5. Clear session (wallet lock)
      await clearSessionMetadata();
      expect(await getSessionMetadata()).toBeNull();
    });

    it('should store all required fields', async () => {
      const metadata: SessionMetadata = {
        unlockedAt: 1609459200000, // Jan 1, 2021
        timeout: 1800000, // 30 minutes
        lastActiveTime: 1609459300000, // 100 seconds later
      };

      await setSessionMetadata(metadata);
      const result = await getSessionMetadata();

      expect(result).toHaveProperty('unlockedAt', 1609459200000);
      expect(result).toHaveProperty('timeout', 1800000);
      expect(result).toHaveProperty('lastActiveTime', 1609459300000);
    });
  });

  describe('timeout configurations', () => {
    it('should handle 1 minute timeout', async () => {
      const metadata: SessionMetadata = {
        unlockedAt: Date.now(),
        timeout: 60000, // 1 minute
        lastActiveTime: Date.now(),
      };

      await setSessionMetadata(metadata);
      const result = await getSessionMetadata();

      expect(result!.timeout).toBe(60000);
    });

    it('should handle 30 minute timeout', async () => {
      const metadata: SessionMetadata = {
        unlockedAt: Date.now(),
        timeout: 1800000, // 30 minutes
        lastActiveTime: Date.now(),
      };

      await setSessionMetadata(metadata);
      const result = await getSessionMetadata();

      expect(result!.timeout).toBe(1800000);
    });
  });
});
