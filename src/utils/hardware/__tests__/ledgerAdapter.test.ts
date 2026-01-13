/**
 * Ledger Adapter Tests (Stub)
 *
 * Ledger support is not yet implemented.
 * These tests verify that the stub correctly throws "not supported" errors.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { getLedgerAdapter, resetLedgerAdapter } from '../ledgerAdapter';
import { HardwareWalletError } from '../types';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

describe('LedgerAdapter (Stub)', () => {
  afterEach(async () => {
    await resetLedgerAdapter();
  });

  it('should throw NOT_SUPPORTED on init', async () => {
    const adapter = getLedgerAdapter();
    await expect(adapter.init()).rejects.toThrow(HardwareWalletError);
    try {
      await adapter.init();
    } catch (error) {
      expect(error).toBeInstanceOf(HardwareWalletError);
      expect((error as HardwareWalletError).code).toBe('NOT_SUPPORTED');
      expect((error as HardwareWalletError).vendor).toBe('ledger');
    }
  });

  it('should return false for isInitialized', () => {
    const adapter = getLedgerAdapter();
    expect(adapter.isInitialized()).toBe(false);
  });

  it('should return disconnected for getConnectionStatus', () => {
    const adapter = getLedgerAdapter();
    expect(adapter.getConnectionStatus()).toBe('disconnected');
  });

  it('should throw NOT_SUPPORTED on getDeviceInfo', async () => {
    const adapter = getLedgerAdapter();
    await expect(adapter.getDeviceInfo()).rejects.toThrow(HardwareWalletError);
  });

  it('should throw NOT_SUPPORTED on getAddress', async () => {
    const adapter = getLedgerAdapter();
    await expect(
      adapter.getAddress(AddressFormat.P2WPKH, 0, 0)
    ).rejects.toThrow(HardwareWalletError);
  });

  it('should throw NOT_SUPPORTED on getAddresses', async () => {
    const adapter = getLedgerAdapter();
    await expect(
      adapter.getAddresses(AddressFormat.P2WPKH, 0, 0, 5)
    ).rejects.toThrow(HardwareWalletError);
  });

  it('should throw NOT_SUPPORTED on getXpub', async () => {
    const adapter = getLedgerAdapter();
    await expect(
      adapter.getXpub(AddressFormat.P2WPKH, 0)
    ).rejects.toThrow(HardwareWalletError);
  });

  it('should throw NOT_SUPPORTED on signTransaction', async () => {
    const adapter = getLedgerAdapter();
    await expect(
      adapter.signTransaction({ inputs: [], outputs: [] })
    ).rejects.toThrow(HardwareWalletError);
  });

  it('should throw NOT_SUPPORTED on signMessage', async () => {
    const adapter = getLedgerAdapter();
    await expect(
      adapter.signMessage({ message: 'test', path: [84, 0, 0, 0, 0] })
    ).rejects.toThrow(HardwareWalletError);
  });

  it('should throw NOT_SUPPORTED on signPsbt', async () => {
    const adapter = getLedgerAdapter();
    await expect(
      adapter.signPsbt({ psbtHex: 'deadbeef', inputPaths: new Map() })
    ).rejects.toThrow(HardwareWalletError);
  });

  it('should not throw on dispose', async () => {
    const adapter = getLedgerAdapter();
    await expect(adapter.dispose()).resolves.not.toThrow();
  });

  it('should return same instance (singleton)', () => {
    const adapter1 = getLedgerAdapter();
    const adapter2 = getLedgerAdapter();
    expect(adapter1).toBe(adapter2);
  });

  it('should create new instance after reset', async () => {
    const adapter1 = getLedgerAdapter();
    await resetLedgerAdapter();
    const adapter2 = getLedgerAdapter();
    expect(adapter1).not.toBe(adapter2);
  });
});
