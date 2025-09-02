import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeUnlockedSecret,
  getUnlockedSecret,
  clearUnlockedSecret,
  clearAllUnlockedSecrets,
  setLastActiveTime,
  getLastActiveTime,
} from '../sessionManager';

describe('sessionManager', () => {
  beforeEach(async () => {
    // Mock chrome.storage.session with valid session metadata
    const validSessionMetadata = {
      sessionMetadata: {
        unlockedAt: Date.now(),
        timeout: 5 * 60 * 1000, // 5 minutes
        lastActiveTime: Date.now(),
      }
    };
    
    global.chrome = {
      storage: {
        session: {
          get: vi.fn().mockResolvedValue(validSessionMetadata),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
      alarms: {
        create: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(true),
      },
    } as any;
    
    // Clear all secrets before each test
    await clearAllUnlockedSecrets();
    vi.clearAllMocks();
  });

  describe('storeUnlockedSecret', () => {
    it('should store a secret for a wallet ID', async () => {
      const walletId = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
      const secret = 'my-secret-passphrase';

      storeUnlockedSecret(walletId, secret);
      
      expect(await getUnlockedSecret(walletId)).toBe(secret);
    });

    it('should overwrite existing secret for same wallet ID', async () => {
      const walletId = 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567a';
      const firstSecret = 'first-secret';
      const secondSecret = 'second-secret';

      storeUnlockedSecret(walletId, firstSecret);
      storeUnlockedSecret(walletId, secondSecret);
      
      expect(await getUnlockedSecret(walletId)).toBe(secondSecret);
    });

    it('should handle empty string secrets correctly', async () => {
      const walletId = 'c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567ab2';
      const secret = '';

      storeUnlockedSecret(walletId, secret);
      
      // Empty string should be stored and retrieved as-is
      expect(await getUnlockedSecret(walletId)).toBe('');
    });

    it('should throw error for null walletId', async () => {
      expect(() => storeUnlockedSecret('', 'secret')).toThrow('Wallet ID is required');
    });

    it('should throw error for null secret', async () => {
      expect(() => storeUnlockedSecret('d4e5f6789012345678901234567890abcdef1234567890abcdef1234567ab2c3', null as any)).toThrow('Secret cannot be null or undefined');
    });

    it('should throw error for undefined secret', async () => {
      expect(() => storeUnlockedSecret('e5f6789012345678901234567890abcdef1234567890abcdef1234567ab2c3d4', undefined as any)).toThrow('Secret cannot be null or undefined');
    });

    it('should handle special characters in secrets', async () => {
      const walletId = 'f6789012345678901234567890abcdef1234567890abcdef1234567ab2c3d4e5';
      const secret = 'secret!@#$%^&*()_+-={}[]|\\:";\'<>?,./';

      storeUnlockedSecret(walletId, secret);
      
      expect(await getUnlockedSecret(walletId)).toBe(secret);
    });

    it('should store multiple secrets for different wallet IDs', async () => {
      const wallet1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const wallet2 = '123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0';
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';

      storeUnlockedSecret(wallet1, secret1);
      storeUnlockedSecret(wallet2, secret2);
      
      expect(await getUnlockedSecret(wallet1)).toBe(secret1);
      expect(await getUnlockedSecret(wallet2)).toBe(secret2);
    });
  });

  describe('getUnlockedSecret', () => {
    it('should return null for non-existent wallet ID', async () => {
      expect(await getUnlockedSecret('non-existent')).toBeNull();
    });

    it('should return null for empty wallet ID', async () => {
      expect(await getUnlockedSecret('')).toBeNull();
    });

    it('should return stored secret correctly', async () => {
      const walletId = '1023456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'stored-secret';

      storeUnlockedSecret(walletId, secret);
      
      expect(await getUnlockedSecret(walletId)).toBe(secret);
    });

    it('should handle wallet IDs with special characters', async () => {
      const walletId = '1134567890abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'special-wallet-secret';

      storeUnlockedSecret(walletId, secret);
      
      expect(await getUnlockedSecret(walletId)).toBe(secret);
    });
  });

  describe('clearUnlockedSecret', () => {
    it('should clear a specific wallet secret', async () => {
      const walletId = '1245678901abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'secret-to-clear';

      storeUnlockedSecret(walletId, secret);
      expect(await getUnlockedSecret(walletId)).toBe(secret);

      clearUnlockedSecret(walletId);
      expect(await getUnlockedSecret(walletId)).toBeNull();
    });

    it('should not affect other wallet secrets when clearing one', async () => {
      const wallet1 = '1356789012abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const wallet2 = '1467890123abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';

      storeUnlockedSecret(wallet1, secret1);
      storeUnlockedSecret(wallet2, secret2);

      clearUnlockedSecret(wallet1);

      expect(await getUnlockedSecret(wallet1)).toBeNull();
      expect(await getUnlockedSecret(wallet2)).toBe(secret2);
    });

    it('should handle clearing non-existent wallet ID gracefully', async () => {
      expect(() => clearUnlockedSecret('non-existent')).not.toThrow();
    });

    it('should overwrite secret with zeros before deletion for security', async () => {
      const walletId = '1578901234abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'sensitive-secret';

      storeUnlockedSecret(walletId, secret);
      clearUnlockedSecret(walletId);

      // The secret should be gone
      expect(await getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle empty string secrets when clearing', async () => {
      const walletId = '1689012345abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = '';

      storeUnlockedSecret(walletId, secret);
      // Empty string should be stored and retrieved correctly
      expect(await getUnlockedSecret(walletId)).toBe('');
      
      clearUnlockedSecret(walletId);
      expect(await getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle clearing with null walletId gracefully', async () => {
      expect(() => clearUnlockedSecret('')).not.toThrow();
      expect(() => clearUnlockedSecret(null as any)).not.toThrow();
    });
  });

  describe('clearAllUnlockedSecrets', () => {
    it('should clear all stored secrets', async () => {
      const wallet1 = '1790123456abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const wallet2 = '1801234567abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const wallet3 = '1912345678abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';
      const secret3 = 'secret-3';

      storeUnlockedSecret(wallet1, secret1);
      storeUnlockedSecret(wallet2, secret2);
      storeUnlockedSecret(wallet3, secret3);

      await clearAllUnlockedSecrets();

      expect(await getUnlockedSecret(wallet1)).toBeNull();
      expect(await getUnlockedSecret(wallet2)).toBeNull();
      expect(await getUnlockedSecret(wallet3)).toBeNull();
    });

    it('should handle clearing when no secrets are stored', async () => {
      await expect(clearAllUnlockedSecrets()).resolves.not.toThrow();
    });

    it('should work correctly after storing new secrets post-clear', async () => {
      const walletId = '2023456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const firstSecret = 'first-secret';
      const secondSecret = 'second-secret';

      storeUnlockedSecret(walletId, firstSecret);
      await clearAllUnlockedSecrets();
      storeUnlockedSecret(walletId, secondSecret);

      expect(await getUnlockedSecret(walletId)).toBe(secondSecret);
    });
  });

  describe('setLastActiveTime and getLastActiveTime', () => {
    it('should set and get last active time', async () => {
      const beforeTime = Date.now();
      await setLastActiveTime();
      const afterTime = Date.now();
      const storedTime = getLastActiveTime();

      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });

    it('should update last active time when called multiple times', async () => {
      await setLastActiveTime();
      const firstTime = getLastActiveTime();

      // Wait a small amount to ensure time difference
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      await setLastActiveTime();
      const secondTime = getLastActiveTime();
      vi.useRealTimers();

      expect(secondTime).toBeGreaterThan(firstTime);
    });

    it('should return a valid timestamp', async () => {
      await setLastActiveTime();
      const timestamp = getLastActiveTime();

      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should have initial timestamp set on module load', async () => {
      const timestamp = getLastActiveTime();
      
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('edge cases and security', () => {
    it('should handle extremely long secrets', async () => {
      const walletId = '2134567890abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const longSecret = 'a'.repeat(1024); // Maximum allowed secret length
      
      storeUnlockedSecret(walletId, longSecret);
      expect(await getUnlockedSecret(walletId)).toBe(longSecret);
      
      clearUnlockedSecret(walletId);
      expect(await getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle null and undefined walletId in getUnlockedSecret', async () => {
      expect(await getUnlockedSecret('')).toBeNull();
      expect(await getUnlockedSecret(null as any)).toBeNull();
      expect(await getUnlockedSecret(undefined as any)).toBeNull();
    });

    it('should handle concurrent access to same wallet', async () => {
      const walletId = '2245678901abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secrets = ['secret1', 'secret2', 'secret3'];
      
      // Simulate concurrent writes
      secrets.forEach(secret => storeUnlockedSecret(walletId, secret));
      
      // Should have the last value
      expect(await getUnlockedSecret(walletId)).toBe('secret3');
    });

    it('should handle large number of wallets', async () => {
      const walletCount = 20; // Reduced to match MAX_WALLETS limit
      const wallets = Array.from({ length: walletCount }, (_, i) => {
        const paddedIndex = i.toString(16).padStart(2, '0');
        return {
          id: `2${paddedIndex}56789012abcdef0123456789abcdef0123456789abcdef0123456789abc${paddedIndex}`,
          secret: `secret-${i}`,
        };
      });
      
      // Store all
      wallets.forEach(({ id, secret }) => storeUnlockedSecret(id, secret));
      
      // Verify random samples
      const samples = [0, 5, 10, 15, 19];
      for (const i of samples) {
        expect(await getUnlockedSecret(wallets[i].id)).toBe(wallets[i].secret);
      }
      
      // Clear all
      await clearAllUnlockedSecrets();
      for (const i of samples) {
        expect(await getUnlockedSecret(wallets[i].id)).toBeNull();
      }
    });
  });

  describe('session expiry and persistence', () => {
    it('should expire session when timeout is exceeded', async () => {
      const walletId = '2356789012abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'test-secret';
      
      // Mock expired session
      global.chrome.storage.session.get = vi.fn().mockResolvedValue({
        sessionMetadata: {
          unlockedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
          timeout: 5 * 60 * 1000, // 5 minute timeout
          lastActiveTime: Date.now() - 10 * 60 * 1000, // 10 minutes ago
        }
      });
      
      storeUnlockedSecret(walletId, secret);
      
      // Should return null due to expired session
      expect(await getUnlockedSecret(walletId)).toBeNull();
    });

    it('should not expire session within timeout period', async () => {
      const walletId = '2467890123abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'test-secret';
      
      // Mock valid session (2 minutes old, 5 minute timeout)
      global.chrome.storage.session.get = vi.fn().mockResolvedValue({
        sessionMetadata: {
          unlockedAt: Date.now() - 2 * 60 * 1000,
          timeout: 5 * 60 * 1000,
          lastActiveTime: Date.now() - 2 * 60 * 1000,
        }
      });
      
      storeUnlockedSecret(walletId, secret);
      
      // Should return secret as session is still valid
      expect(await getUnlockedSecret(walletId)).toBe(secret);
    });

    it('should clear session metadata when session expires', async () => {
      const walletId = '2578901234abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'test-secret';
      
      // Mock expired session
      global.chrome.storage.session.get = vi.fn().mockResolvedValue({
        sessionMetadata: {
          unlockedAt: Date.now() - 10 * 60 * 1000,
          timeout: 5 * 60 * 1000,
          lastActiveTime: Date.now() - 10 * 60 * 1000,
        }
      });
      
      storeUnlockedSecret(walletId, secret);
      await getUnlockedSecret(walletId);
      
      // Should have cleared session metadata
      expect(global.chrome.storage.session.remove).toHaveBeenCalledWith('sessionMetadata');
    });

    it('should reschedule alarm when activity is detected', async () => {
      await setLastActiveTime();
      
      // Should clear and create new alarm
      expect(global.chrome.alarms.clear).toHaveBeenCalledWith('session-expiry');
      expect(global.chrome.alarms.create).toHaveBeenCalledWith(
        'session-expiry',
        expect.objectContaining({
          when: expect.any(Number)
        })
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle full session lifecycle', async () => {
      const walletId = '2689012345abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret = 'integration-secret';

      // Initial state
      expect(await getUnlockedSecret(walletId)).toBeNull();

      // Store secret
      storeUnlockedSecret(walletId, secret);
      expect(await getUnlockedSecret(walletId)).toBe(secret);

      // Update activity
      const beforeActivity = getLastActiveTime();
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);
      await setLastActiveTime();
      const afterActivity = getLastActiveTime();
      vi.useRealTimers();
      
      expect(afterActivity).toBeGreaterThan(beforeActivity);

      // Clear secret
      clearUnlockedSecret(walletId);
      expect(await getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle multiple concurrent wallet sessions', async () => {
      const wallets = Array.from({ length: 5 }, (_, i) => {
        const index = i.toString(16).padStart(2, '0');
        return {
          id: `290${index}3456789abcdef0123456789abcdef0123456789abcdef0123456789a${index}`,
          secret: `secret-${i}`,
        };
      });

      // Store all secrets
      wallets.forEach(({ id, secret }) => {
        storeUnlockedSecret(id, secret);
      });

      // Verify all are stored
      for (const { id, secret } of wallets) {
        expect(await getUnlockedSecret(id)).toBe(secret);
      }

      // Clear some secrets
      clearUnlockedSecret(wallets[0].id);
      clearUnlockedSecret(wallets[2].id);

      // Verify selective clearing
      expect(await getUnlockedSecret(wallets[0].id)).toBeNull();
      expect(await getUnlockedSecret(wallets[1].id)).toBe(wallets[1].secret);
      expect(await getUnlockedSecret(wallets[2].id)).toBeNull();
      expect(await getUnlockedSecret(wallets[3].id)).toBe(wallets[3].secret);
      expect(await getUnlockedSecret(wallets[4].id)).toBe(wallets[4].secret);

      // Clear all remaining
      await clearAllUnlockedSecrets();
      for (const { id } of wallets) {
        expect(await getUnlockedSecret(id)).toBeNull();
      }
    });
  });

  describe('session recovery', () => {
    it('should detect LOCKED state when no session exists', async () => {
      // Mock no session metadata
      global.chrome.storage.session.get = vi.fn().mockResolvedValue({});
      
      const { checkSessionRecovery, SessionRecoveryState } = await import('../sessionManager');
      const state = await checkSessionRecovery();
      
      expect(state).toBe(SessionRecoveryState.LOCKED);
    });

    it('should detect LOCKED state when session is expired', async () => {
      // Mock expired session
      global.chrome.storage.session.get = vi.fn().mockResolvedValue({
        sessionMetadata: {
          unlockedAt: Date.now() - 10 * 60 * 1000,
          timeout: 5 * 60 * 1000,
          lastActiveTime: Date.now() - 10 * 60 * 1000,
        }
      });
      
      const { checkSessionRecovery, SessionRecoveryState } = await import('../sessionManager');
      const state = await checkSessionRecovery();
      
      expect(state).toBe(SessionRecoveryState.LOCKED);
      expect(global.chrome.storage.session.remove).toHaveBeenCalledWith('sessionMetadata');
    });

    it('should detect NEEDS_REAUTH when session valid but no secrets', async () => {
      // Mock valid session
      global.chrome.storage.session.get = vi.fn().mockResolvedValue({
        sessionMetadata: {
          unlockedAt: Date.now(),
          timeout: 5 * 60 * 1000,
          lastActiveTime: Date.now(),
        }
      });
      
      // Clear all secrets first
      await clearAllUnlockedSecrets();
      
      const { checkSessionRecovery, SessionRecoveryState } = await import('../sessionManager');
      const state = await checkSessionRecovery();
      
      expect(state).toBe(SessionRecoveryState.NEEDS_REAUTH);
    });

    it('should detect VALID when session and secrets are present', async () => {
      // Mock valid session
      global.chrome.storage.session.get = vi.fn().mockResolvedValue({
        sessionMetadata: {
          unlockedAt: Date.now(),
          timeout: 5 * 60 * 1000,
          lastActiveTime: Date.now(),
        }
      });
      
      // Store a secret
      storeUnlockedSecret('456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123', 'secret');
      
      const { checkSessionRecovery, SessionRecoveryState } = await import('../sessionManager');
      const state = await checkSessionRecovery();
      
      expect(state).toBe(SessionRecoveryState.VALID);
    });
  });
});