import { describe, it, expect } from 'vitest';
import { DerivationPaths, HardwareWalletError } from '../types';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

describe('DerivationPaths', () => {
  describe('HARDENED constant', () => {
    it('should be 0x80000000', () => {
      expect(DerivationPaths.HARDENED).toBe(0x80000000);
    });
  });

  describe('getPurpose', () => {
    it('should return 44 for P2PKH (Legacy)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2PKH)).toBe(44);
    });

    it('should return 44 for Counterwallet', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.Counterwallet)).toBe(44);
    });

    it('should return 49 for P2SH_P2WPKH (Nested SegWit)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2SH_P2WPKH)).toBe(49);
    });

    it('should return 84 for P2WPKH (Native SegWit)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2WPKH)).toBe(84);
    });

    it('should return 84 for CounterwalletSegwit', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.CounterwalletSegwit)).toBe(84);
    });

    it('should return 86 for P2TR (Taproot)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2TR)).toBe(86);
    });
  });

  describe('getBip44Path', () => {
    it('should return correct path for P2WPKH account 0, address 0', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 0, 0, 0);
      expect(path).toEqual([
        84 | 0x80000000,  // purpose (hardened)
        0 | 0x80000000,   // coin type (hardened) - Bitcoin mainnet
        0 | 0x80000000,   // account (hardened)
        0,                // change (external)
        0,                // address index
      ]);
    });

    it('should return correct path for P2TR account 1, address 5', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2TR, 1, 0, 5);
      expect(path).toEqual([
        86 | 0x80000000,  // purpose (hardened)
        0 | 0x80000000,   // coin type (hardened)
        1 | 0x80000000,   // account 1 (hardened)
        0,                // change (external)
        5,                // address index 5
      ]);
    });

    it('should return correct path for P2PKH with change addresses', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2PKH, 0, 1, 0);
      expect(path).toEqual([
        44 | 0x80000000,
        0 | 0x80000000,
        0 | 0x80000000,
        1,                // change = 1 (internal)
        0,
      ]);
    });

    it('should use default values when not provided', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2WPKH);
      expect(path).toEqual([
        84 | 0x80000000,
        0 | 0x80000000,
        0 | 0x80000000,
        0,
        0,
      ]);
    });
  });

  describe('pathToString', () => {
    it('should convert path array to string format', () => {
      const path = [
        84 | 0x80000000,
        0 | 0x80000000,
        0 | 0x80000000,
        0,
        0,
      ];
      expect(DerivationPaths.pathToString(path)).toBe("m/84'/0'/0'/0/0");
    });

    it('should handle non-hardened path components', () => {
      const path = [0, 1, 2];
      expect(DerivationPaths.pathToString(path)).toBe('m/0/1/2');
    });

    it('should handle mixed hardened and non-hardened', () => {
      const path = [
        44 | 0x80000000,
        0 | 0x80000000,
        5 | 0x80000000,
        0,
        10,
      ];
      expect(DerivationPaths.pathToString(path)).toBe("m/44'/0'/5'/0/10");
    });
  });

  describe('stringToPath', () => {
    it('should parse standard BIP44 path', () => {
      const path = DerivationPaths.stringToPath("m/84'/0'/0'/0/0");
      expect(path).toEqual([
        84 | 0x80000000,
        0 | 0x80000000,
        0 | 0x80000000,
        0,
        0,
      ]);
    });

    it('should handle h notation for hardened', () => {
      const path = DerivationPaths.stringToPath("m/44h/0h/0h/0/0");
      expect(path).toEqual([
        44 | 0x80000000,
        0 | 0x80000000,
        0 | 0x80000000,
        0,
        0,
      ]);
    });

    it('should be inverse of pathToString', () => {
      const original = [
        86 | 0x80000000,
        0 | 0x80000000,
        2 | 0x80000000,
        1,
        42,
      ];
      const str = DerivationPaths.pathToString(original);
      const parsed = DerivationPaths.stringToPath(str);
      expect(parsed).toEqual(original);
    });
  });
});

describe('HardwareWalletError', () => {
  it('should create error with all properties', () => {
    const error = new HardwareWalletError(
      'Test error message',
      'TEST_CODE',
      'trezor',
      'User-friendly message'
    );

    expect(error.message).toBe('Test error message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.vendor).toBe('trezor');
    expect(error.userMessage).toBe('User-friendly message');
    expect(error.name).toBe('HardwareWalletError');
  });

  it('should be instanceof Error', () => {
    const error = new HardwareWalletError('Test', 'CODE', 'trezor');
    expect(error).toBeInstanceOf(Error);
  });

  it('should work without userMessage', () => {
    const error = new HardwareWalletError('Test', 'CODE', 'ledger');
    expect(error.userMessage).toBeUndefined();
  });
});
