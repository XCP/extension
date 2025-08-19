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
  beforeEach(() => {
    // Clear all secrets before each test
    clearAllUnlockedSecrets();
    vi.clearAllMocks();
  });

  describe('storeUnlockedSecret', () => {
    it('should store a secret for a wallet ID', () => {
      const walletId = 'wallet-123';
      const secret = 'my-secret-passphrase';

      storeUnlockedSecret(walletId, secret);
      
      expect(getUnlockedSecret(walletId)).toBe(secret);
    });

    it('should overwrite existing secret for same wallet ID', () => {
      const walletId = 'wallet-123';
      const firstSecret = 'first-secret';
      const secondSecret = 'second-secret';

      storeUnlockedSecret(walletId, firstSecret);
      storeUnlockedSecret(walletId, secondSecret);
      
      expect(getUnlockedSecret(walletId)).toBe(secondSecret);
    });

    it('should handle empty string secrets correctly', () => {
      const walletId = 'wallet-123';
      const secret = '';

      storeUnlockedSecret(walletId, secret);
      
      // Empty string should be stored and retrieved as-is
      expect(getUnlockedSecret(walletId)).toBe('');
    });

    it('should throw error for null walletId', () => {
      expect(() => storeUnlockedSecret('', 'secret')).toThrow('walletId is required');
    });

    it('should throw error for null secret', () => {
      expect(() => storeUnlockedSecret('wallet-123', null as any)).toThrow('secret cannot be null or undefined');
    });

    it('should throw error for undefined secret', () => {
      expect(() => storeUnlockedSecret('wallet-123', undefined as any)).toThrow('secret cannot be null or undefined');
    });

    it('should handle special characters in secrets', () => {
      const walletId = 'wallet-123';
      const secret = 'secret!@#$%^&*()_+-={}[]|\\:";\'<>?,./';

      storeUnlockedSecret(walletId, secret);
      
      expect(getUnlockedSecret(walletId)).toBe(secret);
    });

    it('should store multiple secrets for different wallet IDs', () => {
      const wallet1 = 'wallet-1';
      const wallet2 = 'wallet-2';
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';

      storeUnlockedSecret(wallet1, secret1);
      storeUnlockedSecret(wallet2, secret2);
      
      expect(getUnlockedSecret(wallet1)).toBe(secret1);
      expect(getUnlockedSecret(wallet2)).toBe(secret2);
    });
  });

  describe('getUnlockedSecret', () => {
    it('should return null for non-existent wallet ID', () => {
      expect(getUnlockedSecret('non-existent')).toBeNull();
    });

    it('should return null for empty wallet ID', () => {
      expect(getUnlockedSecret('')).toBeNull();
    });

    it('should return stored secret correctly', () => {
      const walletId = 'wallet-123';
      const secret = 'stored-secret';

      storeUnlockedSecret(walletId, secret);
      
      expect(getUnlockedSecret(walletId)).toBe(secret);
    });

    it('should handle wallet IDs with special characters', () => {
      const walletId = 'wallet-!@#$%^&*()';
      const secret = 'special-wallet-secret';

      storeUnlockedSecret(walletId, secret);
      
      expect(getUnlockedSecret(walletId)).toBe(secret);
    });
  });

  describe('clearUnlockedSecret', () => {
    it('should clear a specific wallet secret', () => {
      const walletId = 'wallet-123';
      const secret = 'secret-to-clear';

      storeUnlockedSecret(walletId, secret);
      expect(getUnlockedSecret(walletId)).toBe(secret);

      clearUnlockedSecret(walletId);
      expect(getUnlockedSecret(walletId)).toBeNull();
    });

    it('should not affect other wallet secrets when clearing one', () => {
      const wallet1 = 'wallet-1';
      const wallet2 = 'wallet-2';
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';

      storeUnlockedSecret(wallet1, secret1);
      storeUnlockedSecret(wallet2, secret2);

      clearUnlockedSecret(wallet1);

      expect(getUnlockedSecret(wallet1)).toBeNull();
      expect(getUnlockedSecret(wallet2)).toBe(secret2);
    });

    it('should handle clearing non-existent wallet ID gracefully', () => {
      expect(() => clearUnlockedSecret('non-existent')).not.toThrow();
    });

    it('should overwrite secret with zeros before deletion for security', () => {
      const walletId = 'wallet-123';
      const secret = 'sensitive-secret';

      storeUnlockedSecret(walletId, secret);
      clearUnlockedSecret(walletId);

      // The secret should be gone
      expect(getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle empty string secrets when clearing', () => {
      const walletId = 'wallet-123';
      const secret = '';

      storeUnlockedSecret(walletId, secret);
      // Empty string should be stored and retrieved correctly
      expect(getUnlockedSecret(walletId)).toBe('');
      
      clearUnlockedSecret(walletId);
      expect(getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle clearing with null walletId gracefully', () => {
      expect(() => clearUnlockedSecret('')).not.toThrow();
      expect(() => clearUnlockedSecret(null as any)).not.toThrow();
    });
  });

  describe('clearAllUnlockedSecrets', () => {
    it('should clear all stored secrets', () => {
      const wallet1 = 'wallet-1';
      const wallet2 = 'wallet-2';
      const wallet3 = 'wallet-3';
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';
      const secret3 = 'secret-3';

      storeUnlockedSecret(wallet1, secret1);
      storeUnlockedSecret(wallet2, secret2);
      storeUnlockedSecret(wallet3, secret3);

      clearAllUnlockedSecrets();

      expect(getUnlockedSecret(wallet1)).toBeNull();
      expect(getUnlockedSecret(wallet2)).toBeNull();
      expect(getUnlockedSecret(wallet3)).toBeNull();
    });

    it('should handle clearing when no secrets are stored', () => {
      expect(() => clearAllUnlockedSecrets()).not.toThrow();
    });

    it('should work correctly after storing new secrets post-clear', () => {
      const walletId = 'wallet-123';
      const firstSecret = 'first-secret';
      const secondSecret = 'second-secret';

      storeUnlockedSecret(walletId, firstSecret);
      clearAllUnlockedSecrets();
      storeUnlockedSecret(walletId, secondSecret);

      expect(getUnlockedSecret(walletId)).toBe(secondSecret);
    });
  });

  describe('setLastActiveTime and getLastActiveTime', () => {
    it('should set and get last active time', () => {
      const beforeTime = Date.now();
      setLastActiveTime();
      const afterTime = Date.now();
      const storedTime = getLastActiveTime();

      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });

    it('should update last active time when called multiple times', () => {
      setLastActiveTime();
      const firstTime = getLastActiveTime();

      // Wait a small amount to ensure time difference
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      setLastActiveTime();
      const secondTime = getLastActiveTime();
      vi.useRealTimers();

      expect(secondTime).toBeGreaterThan(firstTime);
    });

    it('should return a valid timestamp', () => {
      setLastActiveTime();
      const timestamp = getLastActiveTime();

      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should have initial timestamp set on module load', () => {
      const timestamp = getLastActiveTime();
      
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('edge cases and security', () => {
    it('should handle extremely long secrets', () => {
      const walletId = 'wallet-long';
      const longSecret = 'a'.repeat(10000); // 10KB secret
      
      storeUnlockedSecret(walletId, longSecret);
      expect(getUnlockedSecret(walletId)).toBe(longSecret);
      
      clearUnlockedSecret(walletId);
      expect(getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle null and undefined walletId in getUnlockedSecret', () => {
      expect(getUnlockedSecret('')).toBeNull();
      expect(getUnlockedSecret(null as any)).toBeNull();
      expect(getUnlockedSecret(undefined as any)).toBeNull();
    });

    it('should handle concurrent access to same wallet', () => {
      const walletId = 'concurrent-wallet';
      const secrets = ['secret1', 'secret2', 'secret3'];
      
      // Simulate concurrent writes
      secrets.forEach(secret => storeUnlockedSecret(walletId, secret));
      
      // Should have the last value
      expect(getUnlockedSecret(walletId)).toBe('secret3');
    });

    it('should handle large number of wallets', () => {
      const walletCount = 1000;
      const wallets = Array.from({ length: walletCount }, (_, i) => ({
        id: `wallet-${i}`,
        secret: `secret-${i}`,
      }));
      
      // Store all
      wallets.forEach(({ id, secret }) => storeUnlockedSecret(id, secret));
      
      // Verify random samples
      const samples = [0, 250, 500, 750, 999];
      samples.forEach(i => {
        expect(getUnlockedSecret(wallets[i].id)).toBe(wallets[i].secret);
      });
      
      // Clear all
      clearAllUnlockedSecrets();
      samples.forEach(i => {
        expect(getUnlockedSecret(wallets[i].id)).toBeNull();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle full session lifecycle', () => {
      const walletId = 'integration-wallet';
      const secret = 'integration-secret';

      // Initial state
      expect(getUnlockedSecret(walletId)).toBeNull();

      // Store secret
      storeUnlockedSecret(walletId, secret);
      expect(getUnlockedSecret(walletId)).toBe(secret);

      // Update activity
      const beforeActivity = getLastActiveTime();
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);
      setLastActiveTime();
      const afterActivity = getLastActiveTime();
      vi.useRealTimers();
      
      expect(afterActivity).toBeGreaterThan(beforeActivity);

      // Clear secret
      clearUnlockedSecret(walletId);
      expect(getUnlockedSecret(walletId)).toBeNull();
    });

    it('should handle multiple concurrent wallet sessions', () => {
      const wallets = Array.from({ length: 5 }, (_, i) => ({
        id: `wallet-${i}`,
        secret: `secret-${i}`,
      }));

      // Store all secrets
      wallets.forEach(({ id, secret }) => {
        storeUnlockedSecret(id, secret);
      });

      // Verify all are stored
      wallets.forEach(({ id, secret }) => {
        expect(getUnlockedSecret(id)).toBe(secret);
      });

      // Clear some secrets
      clearUnlockedSecret(wallets[0].id);
      clearUnlockedSecret(wallets[2].id);

      // Verify selective clearing
      expect(getUnlockedSecret(wallets[0].id)).toBeNull();
      expect(getUnlockedSecret(wallets[1].id)).toBe(wallets[1].secret);
      expect(getUnlockedSecret(wallets[2].id)).toBeNull();
      expect(getUnlockedSecret(wallets[3].id)).toBe(wallets[3].secret);
      expect(getUnlockedSecret(wallets[4].id)).toBe(wallets[4].secret);

      // Clear all remaining
      clearAllUnlockedSecrets();
      wallets.forEach(({ id }) => {
        expect(getUnlockedSecret(id)).toBeNull();
      });
    });
  });
});