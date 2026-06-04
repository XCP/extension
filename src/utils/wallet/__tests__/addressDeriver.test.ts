import { describe, it, expect } from 'vitest';
import {
  generateWalletId,
  generateWalletIdFromPrivateKey,
  deriveMnemonicAddress,
  deriveAddressFromPrivateKey,
  deriveAddressesFromSecret,
} from '../addressDeriver';
import {
  getAddressFromMnemonic,
  getDerivationPathForAddressFormat,
  AddressFormat,
} from '@/utils/blockchain/bitcoin/address';
import { getAddressFromPrivateKey } from '@/utils/blockchain/bitcoin/privateKey';
import type { WalletRecord } from '@/types/wallet';

// Standard BIP39 test vector mnemonic.
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Private key = 1 (valid secp256k1 scalar).
const PRIV_HEX = '0000000000000000000000000000000000000000000000000000000000000001';

describe('addressDeriver', () => {
  describe('deriveMnemonicAddress', () => {
    it('derives the same address as getAddressFromMnemonic at the indexed path', () => {
      for (const format of [AddressFormat.P2WPKH, AddressFormat.P2PKH, AddressFormat.P2TR]) {
        for (const index of [0, 1, 5]) {
          const expectedPath = `${getDerivationPathForAddressFormat(format)}/${index}`;
          const result = deriveMnemonicAddress(MNEMONIC, format, index);

          expect(result.address).toBe(getAddressFromMnemonic(MNEMONIC, expectedPath, format));
          expect(result.path).toBe(expectedPath);
          expect(result.name).toBe(`Address ${index + 1}`);
          expect(result.pubKey).toMatch(/^[0-9a-f]+$/);
        }
      }
    });

    it('is deterministic', () => {
      const a = deriveMnemonicAddress(MNEMONIC, AddressFormat.P2WPKH, 0);
      const b = deriveMnemonicAddress(MNEMONIC, AddressFormat.P2WPKH, 0);
      expect(a).toEqual(b);
    });
  });

  describe('generateWalletId', () => {
    it('is deterministic for the same mnemonic + format', async () => {
      const a = await generateWalletId(MNEMONIC, AddressFormat.P2WPKH);
      const b = await generateWalletId(MNEMONIC, AddressFormat.P2WPKH);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('differs by address format (format is part of the id)', async () => {
      const p2wpkh = await generateWalletId(MNEMONIC, AddressFormat.P2WPKH);
      const p2pkh = await generateWalletId(MNEMONIC, AddressFormat.P2PKH);
      expect(p2wpkh).not.toBe(p2pkh);
    });
  });

  describe('generateWalletIdFromPrivateKey', () => {
    it('is deterministic and format-sensitive', async () => {
      const a = await generateWalletIdFromPrivateKey(PRIV_HEX, AddressFormat.P2WPKH);
      const b = await generateWalletIdFromPrivateKey(PRIV_HEX, AddressFormat.P2WPKH);
      const other = await generateWalletIdFromPrivateKey(PRIV_HEX, AddressFormat.P2PKH);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).not.toBe(other);
    });
  });

  describe('deriveAddressFromPrivateKey', () => {
    it('matches getAddressFromPrivateKey and labels Address 1', () => {
      const result = deriveAddressFromPrivateKey(
        JSON.stringify({ hex: PRIV_HEX, compressed: true }),
        AddressFormat.P2WPKH
      );
      expect(result.address).toBe(getAddressFromPrivateKey(PRIV_HEX, AddressFormat.P2WPKH, true));
      expect(result.name).toBe('Address 1');
      expect(result.path).toBe('');
    });
  });

  describe('deriveAddressesFromSecret', () => {
    it('derives addressCount addresses for a mnemonic wallet', () => {
      const record = {
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        addressCount: 3,
      } as unknown as WalletRecord;

      const addresses = deriveAddressesFromSecret(MNEMONIC, record);
      expect(addresses).toHaveLength(3);
      addresses.forEach((addr, i) => {
        expect(addr.address).toBe(deriveMnemonicAddress(MNEMONIC, AddressFormat.P2WPKH, i).address);
      });
    });

    it('uses the record previewAddress for a hardware wallet', () => {
      const record = {
        type: 'hardware',
        previewAddress: 'bc1qhardwarepreview',
      } as unknown as WalletRecord;
      const secret = JSON.stringify({ derivationPath: "m/84'/0'/0'/0/0", publicKey: 'deadbeef' });

      const addresses = deriveAddressesFromSecret(secret, record);
      expect(addresses).toEqual([
        { name: 'Address 1', path: "m/84'/0'/0'/0/0", address: 'bc1qhardwarepreview', pubKey: 'deadbeef' },
      ]);
    });

    it('returns the embedded address for a test-only wallet', () => {
      const record = { type: 'privateKey', isTestOnly: true } as unknown as WalletRecord;
      const secret = JSON.stringify({ isTestWallet: true, address: 'test-address' });

      const addresses = deriveAddressesFromSecret(secret, record);
      expect(addresses).toEqual([
        { name: 'Test Address', path: 'm/test', address: 'test-address', pubKey: '' },
      ]);
    });

    it('derives from a private key for a private-key wallet', () => {
      const record = { type: 'privateKey', addressFormat: AddressFormat.P2WPKH } as unknown as WalletRecord;
      const secret = JSON.stringify({ hex: PRIV_HEX, compressed: true });

      const addresses = deriveAddressesFromSecret(secret, record);
      expect(addresses).toHaveLength(1);
      expect(addresses[0].address).toBe(getAddressFromPrivateKey(PRIV_HEX, AddressFormat.P2WPKH, true));
    });

    it('returns [] for malformed hardware secret', () => {
      const record = { type: 'hardware', previewAddress: 'x' } as unknown as WalletRecord;
      expect(deriveAddressesFromSecret('not-json', record)).toEqual([]);
    });
  });
});
