import { describe, it, expect } from 'vitest';
import { sanitizePath } from '../fathom';

describe('fathom utilities', () => {

  describe('sanitizePath', () => {
    it('should sanitize sensitive paths', () => {
      expect(sanitizePath('/show-private-key/wallet-123')).toBe('/show-private-key');
      expect(sanitizePath('/show-passphrase/some-id')).toBe('/show-passphrase');
      expect(sanitizePath('/remove-wallet/wallet-456')).toBe('/remove-wallet');
      expect(sanitizePath('/balance/address-789')).toBe('/balance');
      expect(sanitizePath('/asset/PEPECASH')).toBe('/asset');
      expect(sanitizePath('/utxo/utxo-id')).toBe('/utxo');
    });

    it('should sanitize action paths', () => {
      expect(sanitizePath('/actions/consolidate/review')).toBe('/actions/consolidate');
      expect(sanitizePath('/actions/sign-message/extra/params')).toBe('/actions/sign-message');
    });

    it('should sanitize compose paths', () => {
      expect(sanitizePath('/compose/send/btc/review')).toBe('/compose/send');
      expect(sanitizePath('/compose/order/form/extra')).toBe('/compose/order');
    });

    it('should return original path for non-sensitive paths', () => {
      expect(sanitizePath('/dashboard')).toBe('/dashboard');
      expect(sanitizePath('/settings')).toBe('/settings');
      expect(sanitizePath('/')).toBe('/');
      expect(sanitizePath('/wallet')).toBe('/wallet');
    });

    it('should handle edge cases', () => {
      expect(sanitizePath('')).toBe('');
      expect(sanitizePath('/actions/')).toBe('/actions/');
      expect(sanitizePath('/compose/')).toBe('/compose/');
      expect(sanitizePath('/actions/single')).toBe('/actions/single');
    });
  });

  // Note: DOM-dependent tests for window.fathom, trackEvent, and trackPageview
  // are omitted since they require complex browser environment setup.
  // The sanitizePath function covers the core logic that can be unit tested.
});