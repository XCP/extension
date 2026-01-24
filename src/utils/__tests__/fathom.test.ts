import { describe, it, expect } from 'vitest';
import { sanitizePath, getBtcBucket } from '../fathom';

describe('fathom sanitizePath', () => {
  describe('asset viewing paths', () => {
    it('strips asset name from /assets/:asset', () => {
      expect(sanitizePath('/assets/XCP')).toBe('/assets');
      expect(sanitizePath('/assets/PEPE')).toBe('/assets');
      expect(sanitizePath('/assets/A1234567890123456789')).toBe('/assets');
    });

    it('strips asset name from /assets/:asset/balance', () => {
      expect(sanitizePath('/assets/XCP/balance')).toBe('/assets');
      expect(sanitizePath('/assets/BTC/balance')).toBe('/assets');
      expect(sanitizePath('/assets/PEPECASH/balance')).toBe('/assets');
    });

    it('strips txid from /utxo/:txHash', () => {
      expect(sanitizePath('/utxo/abc123def456')).toBe('/utxo');
      expect(sanitizePath('/utxo/0000000000000000000000000000000000000000000000000000000000000000')).toBe('/utxo');
    });
  });

  describe('transaction paths', () => {
    it('strips tx hash from /transaction/:txHash', () => {
      expect(sanitizePath('/transaction/eac34ba25e055ac2524e67e5bd32a60f49311345f646fde561ed1de70696b543')).toBe('/transaction');
      expect(sanitizePath('/transaction/0000000000000000000000000000000000000000000000000000000000000000')).toBe('/transaction');
    });
  });

  describe('market paths', () => {
    it('strips asset from /market/dispensers/:asset', () => {
      expect(sanitizePath('/market/dispensers/XCP')).toBe('/market/dispensers');
      expect(sanitizePath('/market/dispensers/PEPE')).toBe('/market/dispensers');
    });

    it('strips assets from /market/orders/:baseAsset/:quoteAsset', () => {
      expect(sanitizePath('/market/orders/XCP/BTC')).toBe('/market/orders');
      expect(sanitizePath('/market/orders/PEPE/XCP')).toBe('/market/orders');
    });
  });

  describe('wallet management paths', () => {
    it('strips wallet ID from /wallet/remove/:walletId', () => {
      expect(sanitizePath('/wallet/remove/abc123')).toBe('/wallet/remove');
    });

    it('strips wallet ID from /wallet/show-passphrase/:walletId', () => {
      expect(sanitizePath('/wallet/show-passphrase/wallet-123')).toBe('/wallet/show-passphrase');
    });

    it('strips wallet ID from /wallet/show-private-key/:walletId', () => {
      expect(sanitizePath('/wallet/show-private-key/wallet-456')).toBe('/wallet/show-private-key');
      expect(sanitizePath('/wallet/show-private-key/wallet-456/m/84/0/0')).toBe('/wallet/show-private-key');
    });
  });

  describe('compose paths', () => {
    it('strips asset from compose send paths', () => {
      expect(sanitizePath('/compose/send/XCP')).toBe('/compose/send');
      expect(sanitizePath('/compose/send/BTC')).toBe('/compose/send');
    });

    it('preserves compose mpma path (no sensitive params)', () => {
      expect(sanitizePath('/compose/send/mpma')).toBe('/compose/send');
    });

    it('strips asset from compose issuance paths', () => {
      expect(sanitizePath('/compose/issuance/MYASSET')).toBe('/compose/issuance');
    });

    it('strips asset from compose dispenser paths', () => {
      expect(sanitizePath('/compose/dispenser/XCP')).toBe('/compose/dispenser');
    });
  });

  describe('action paths', () => {
    it('strips params from action paths', () => {
      expect(sanitizePath('/actions/sign-message')).toBe('/actions/sign-message');
      expect(sanitizePath('/actions/verify-message/abc123')).toBe('/actions/verify-message');
    });
  });

  describe('safe paths', () => {
    it('preserves paths without sensitive data', () => {
      expect(sanitizePath('/index')).toBe('/index');
      expect(sanitizePath('/market')).toBe('/market');
      expect(sanitizePath('/settings')).toBe('/settings');
      expect(sanitizePath('/onboarding')).toBe('/onboarding');
      expect(sanitizePath('/wallet/add')).toBe('/wallet/add');
    });
  });
});

describe('fathom getBtcBucket', () => {
  it('returns 0 for dust amounts', () => {
    expect(getBtcBucket(0.000001)).toBe(0);
    expect(getBtcBucket(0.000009)).toBe(0);
  });

  it('returns correct bucket for micro amounts', () => {
    expect(getBtcBucket(0.00001)).toBe(1);
    expect(getBtcBucket(0.00005)).toBe(1);
  });

  it('returns correct bucket for small amounts', () => {
    expect(getBtcBucket(0.001)).toBe(100);
    expect(getBtcBucket(0.005)).toBe(100);
  });

  it('returns correct bucket for medium amounts', () => {
    expect(getBtcBucket(0.01)).toBe(1000);
    expect(getBtcBucket(0.05)).toBe(1000);
  });

  it('returns correct bucket for large amounts', () => {
    expect(getBtcBucket(0.1)).toBe(10000);
    expect(getBtcBucket(0.5)).toBe(10000);
  });

  it('returns correct bucket for whale amounts', () => {
    expect(getBtcBucket(1)).toBe(100000);
    expect(getBtcBucket(5)).toBe(100000);
  });

  it('returns correct bucket for mega amounts', () => {
    expect(getBtcBucket(10)).toBe(1000000);
    expect(getBtcBucket(100)).toBe(1000000);
  });
});
