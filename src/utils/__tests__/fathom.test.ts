import { describe, it, expect } from 'vitest';
import { sanitizePath, getBtcBucket } from '../fathom';

describe('fathom sanitizePath', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // WALLET SECRETS (highest sensitivity)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('wallet secrets paths', () => {
    it('strips wallet ID from /wallet/secrets/show-passphrase/:walletId', () => {
      expect(sanitizePath('/wallet/secrets/show-passphrase/wallet-123')).toBe('/wallet/secrets/show-passphrase');
      expect(sanitizePath('/wallet/secrets/show-passphrase/abc-def-ghi')).toBe('/wallet/secrets/show-passphrase');
    });

    it('strips wallet ID and derivation path from /wallet/secrets/show-private-key/:walletId/:path?', () => {
      expect(sanitizePath('/wallet/secrets/show-private-key/wallet-456')).toBe('/wallet/secrets/show-private-key');
      expect(sanitizePath('/wallet/secrets/show-private-key/wallet-456/m/84/0/0')).toBe('/wallet/secrets/show-private-key');
      expect(sanitizePath("/wallet/secrets/show-private-key/abc123/m/84'/0'/0'/0/0")).toBe('/wallet/secrets/show-private-key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WALLET MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('wallet management paths', () => {
    it('strips wallet ID from /wallet/remove/:walletId', () => {
      expect(sanitizePath('/wallet/remove/abc123')).toBe('/wallet/remove');
      expect(sanitizePath('/wallet/remove/wallet-uuid-here')).toBe('/wallet/remove');
    });

    it('preserves static wallet paths', () => {
      expect(sanitizePath('/wallet/add')).toBe('/wallet/add');
      expect(sanitizePath('/wallet/select')).toBe('/wallet/select');
      expect(sanitizePath('/wallet/create')).toBe('/wallet/create');
      expect(sanitizePath('/wallet/import')).toBe('/wallet/import');
      expect(sanitizePath('/wallet/reset')).toBe('/wallet/reset');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTIONS & UTXOS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('transaction paths', () => {
    it('strips tx hash from /transaction/:txHash', () => {
      expect(sanitizePath('/transaction/eac34ba25e055ac2524e67e5bd32a60f49311345f646fde561ed1de70696b543')).toBe('/transaction');
      expect(sanitizePath('/transaction/0000000000000000000000000000000000000000000000000000000000000000')).toBe('/transaction');
    });

    it('strips UTXO identifier from /assets/utxo/:txHash', () => {
      expect(sanitizePath('/assets/utxo/abc123def456:0')).toBe('/assets/utxo');
      expect(sanitizePath('/assets/utxo/0000000000000000000000000000000000000000000000000000000000000000:1')).toBe('/assets/utxo');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSET VIEWING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('asset viewing paths', () => {
    it('strips asset name from /assets/:asset', () => {
      expect(sanitizePath('/assets/XCP')).toBe('/assets');
      expect(sanitizePath('/assets/RARE.PEPE')).toBe('/assets');
      expect(sanitizePath('/assets/A1234567890123456789')).toBe('/assets');
    });

    it('strips asset name from /assets/:asset/balance', () => {
      expect(sanitizePath('/assets/XCP/balance')).toBe('/assets');
      expect(sanitizePath('/assets/BTC/balance')).toBe('/assets');
      expect(sanitizePath('/assets/PEPECASH/balance')).toBe('/assets');
    });

    it('preserves /assets/select (static path)', () => {
      expect(sanitizePath('/assets/select')).toBe('/assets');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKET
  // ═══════════════════════════════════════════════════════════════════════════
  describe('market paths', () => {
    it('preserves /market/dispensers/manage (static path)', () => {
      expect(sanitizePath('/market/dispensers/manage')).toBe('/market/dispensers/manage');
    });

    it('strips asset from /market/dispensers/:asset', () => {
      expect(sanitizePath('/market/dispensers/XCP')).toBe('/market/dispensers');
      expect(sanitizePath('/market/dispensers/RARE.PEPE')).toBe('/market/dispensers');
    });

    it('strips trading pair from /market/orders/:baseAsset/:quoteAsset', () => {
      expect(sanitizePath('/market/orders/XCP/BTC')).toBe('/market/orders');
      expect(sanitizePath('/market/orders/PEPE/XCP')).toBe('/market/orders');
    });

    it('preserves static market paths', () => {
      expect(sanitizePath('/market')).toBe('/market');
      expect(sanitizePath('/market/btc')).toBe('/market/btc');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE - ISSUANCE
  // ═══════════════════════════════════════════════════════════════════════════
  describe('compose issuance paths', () => {
    it('strips asset from /compose/issuance/:asset', () => {
      expect(sanitizePath('/compose/issuance/MYASSET')).toBe('/compose/issuance');
      expect(sanitizePath('/compose/issuance/A1234567890123456789')).toBe('/compose/issuance');
    });

    it('preserves operation type while stripping asset', () => {
      expect(sanitizePath('/compose/issuance/issue-supply/MYTOKEN')).toBe('/compose/issuance/issue-supply');
      expect(sanitizePath('/compose/issuance/lock-supply/MYTOKEN')).toBe('/compose/issuance/lock-supply');
      expect(sanitizePath('/compose/issuance/reset-supply/MYTOKEN')).toBe('/compose/issuance/reset-supply');
      expect(sanitizePath('/compose/issuance/transfer-ownership/MYTOKEN')).toBe('/compose/issuance/transfer-ownership');
      expect(sanitizePath('/compose/issuance/update-description/MYTOKEN')).toBe('/compose/issuance/update-description');
      expect(sanitizePath('/compose/issuance/lock-description/MYTOKEN')).toBe('/compose/issuance/lock-description');
      expect(sanitizePath('/compose/issuance/destroy/MYTOKEN')).toBe('/compose/issuance/destroy');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE - DISPENSERS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('compose dispenser paths', () => {
    it('strips asset from /compose/dispenser/:asset', () => {
      expect(sanitizePath('/compose/dispenser/XCP')).toBe('/compose/dispenser');
      expect(sanitizePath('/compose/dispenser/PEPE')).toBe('/compose/dispenser');
    });

    it('preserves operation type while stripping params', () => {
      expect(sanitizePath('/compose/dispenser/close/MYASSET')).toBe('/compose/dispenser/close');
      expect(sanitizePath('/compose/dispenser/close-by-hash/abc123def456')).toBe('/compose/dispenser/close-by-hash');
      expect(sanitizePath('/compose/dispenser/dispense/bc1qaddr123')).toBe('/compose/dispenser/dispense');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE - ORDERS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('compose order paths', () => {
    it('strips asset from /compose/order/:asset', () => {
      expect(sanitizePath('/compose/order/XCP')).toBe('/compose/order');
      expect(sanitizePath('/compose/order/PEPE')).toBe('/compose/order');
    });

    it('preserves /compose/order/btcpay (static path)', () => {
      expect(sanitizePath('/compose/order/btcpay')).toBe('/compose/order/btcpay');
    });

    it('strips hash from /compose/order/cancel/:hash', () => {
      expect(sanitizePath('/compose/order/cancel/abc123def456')).toBe('/compose/order/cancel');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE - UTXO
  // ═══════════════════════════════════════════════════════════════════════════
  describe('compose utxo paths', () => {
    it('strips asset from /compose/utxo/attach/:asset', () => {
      expect(sanitizePath('/compose/utxo/attach/XCP')).toBe('/compose/utxo/attach');
      expect(sanitizePath('/compose/utxo/attach/RARE.PEPE')).toBe('/compose/utxo/attach');
    });

    it('strips txid from /compose/utxo/detach/:txid', () => {
      expect(sanitizePath('/compose/utxo/detach/abc123:0')).toBe('/compose/utxo/detach');
    });

    it('strips txid from /compose/utxo/move/:txid', () => {
      expect(sanitizePath('/compose/utxo/move/abc123:0')).toBe('/compose/utxo/move');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE - FAIRMINTING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('compose fairminting paths', () => {
    it('strips asset from /compose/fairminter/:asset', () => {
      expect(sanitizePath('/compose/fairminter/MYTOKEN')).toBe('/compose/fairminter');
    });

    it('strips asset from /compose/fairmint/:asset', () => {
      expect(sanitizePath('/compose/fairmint/MYTOKEN')).toBe('/compose/fairmint');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE - OTHER
  // ═══════════════════════════════════════════════════════════════════════════
  describe('compose other paths', () => {
    it('strips asset from /compose/send/:asset', () => {
      expect(sanitizePath('/compose/send/XCP')).toBe('/compose/send');
      expect(sanitizePath('/compose/send/BTC')).toBe('/compose/send');
    });

    it('preserves /compose/send/mpma (static path)', () => {
      expect(sanitizePath('/compose/send/mpma')).toBe('/compose/send/mpma');
    });

    it('strips address from /compose/sweep/:address', () => {
      expect(sanitizePath('/compose/sweep/bc1qtest123')).toBe('/compose/sweep');
      expect(sanitizePath('/compose/sweep/1CounterpartyXXXXXXXXXXXXXXXUWLpVr')).toBe('/compose/sweep');
    });

    it('strips asset from /compose/dividend/:asset', () => {
      expect(sanitizePath('/compose/dividend/XCP')).toBe('/compose/dividend');
    });

    it('preserves static compose paths', () => {
      expect(sanitizePath('/compose/broadcast')).toBe('/compose/broadcast');
      expect(sanitizePath('/compose/broadcast/address-options')).toBe('/compose/broadcast/address-options');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATIC PATHS (should pass through unchanged)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('static paths (no sensitive data)', () => {
    it('preserves main navigation paths', () => {
      expect(sanitizePath('/index')).toBe('/index');
      expect(sanitizePath('/market')).toBe('/market');
      expect(sanitizePath('/actions')).toBe('/actions');
      expect(sanitizePath('/settings')).toBe('/settings');
    });

    it('preserves auth paths', () => {
      expect(sanitizePath('/onboarding')).toBe('/onboarding');
      expect(sanitizePath('/unlock-wallet')).toBe('/unlock-wallet');
    });

    it('preserves settings subpaths', () => {
      expect(sanitizePath('/settings/address-type')).toBe('/settings/address-type');
      expect(sanitizePath('/settings/advanced')).toBe('/settings/advanced');
      expect(sanitizePath('/settings/security')).toBe('/settings/security');
      expect(sanitizePath('/settings/connected-sites')).toBe('/settings/connected-sites');
      expect(sanitizePath('/settings/pinned-assets')).toBe('/settings/pinned-assets');
    });

    it('preserves action paths', () => {
      expect(sanitizePath('/actions/consolidate')).toBe('/actions/consolidate');
      expect(sanitizePath('/actions/consolidate/success')).toBe('/actions/consolidate/success');
      expect(sanitizePath('/actions/consolidate/status')).toBe('/actions/consolidate/status');
      expect(sanitizePath('/actions/sign-message')).toBe('/actions/sign-message');
      expect(sanitizePath('/actions/verify-message')).toBe('/actions/verify-message');
    });

    it('preserves address paths', () => {
      expect(sanitizePath('/address/history')).toBe('/address/history');
      expect(sanitizePath('/address/select')).toBe('/address/select');
      expect(sanitizePath('/address/view')).toBe('/address/view');
    });

    it('preserves provider paths', () => {
      expect(sanitizePath('/provider/approve-connection')).toBe('/provider/approve-connection');
      expect(sanitizePath('/provider/approve-transaction')).toBe('/provider/approve-transaction');
      expect(sanitizePath('/provider/approve-psbt')).toBe('/provider/approve-psbt');
    });
  });
});

describe('fathom getBtcBucket', () => {
  it('returns 0 for dust amounts (< 1000 sats)', () => {
    expect(getBtcBucket(0.000001)).toBe(0);
    expect(getBtcBucket(0.000009)).toBe(0);
  });

  it('returns 1 for micro amounts (1000-10000 sats)', () => {
    expect(getBtcBucket(0.00001)).toBe(1);
    expect(getBtcBucket(0.00005)).toBe(1);
  });

  it('returns 10 for tiny amounts (0.0001-0.001 BTC)', () => {
    expect(getBtcBucket(0.0001)).toBe(10);
    expect(getBtcBucket(0.0005)).toBe(10);
  });

  it('returns 100 for small amounts (0.001-0.01 BTC)', () => {
    expect(getBtcBucket(0.001)).toBe(100);
    expect(getBtcBucket(0.005)).toBe(100);
  });

  it('returns 1000 for medium amounts (0.01-0.1 BTC)', () => {
    expect(getBtcBucket(0.01)).toBe(1000);
    expect(getBtcBucket(0.05)).toBe(1000);
  });

  it('returns 10000 for large amounts (0.1-1 BTC)', () => {
    expect(getBtcBucket(0.1)).toBe(10000);
    expect(getBtcBucket(0.5)).toBe(10000);
  });

  it('returns 100000 for whale amounts (1-10 BTC)', () => {
    expect(getBtcBucket(1)).toBe(100000);
    expect(getBtcBucket(5)).toBe(100000);
  });

  it('returns 1000000 for mega amounts (> 10 BTC)', () => {
    expect(getBtcBucket(10)).toBe(1000000);
    expect(getBtcBucket(100)).toBe(1000000);
  });
});
