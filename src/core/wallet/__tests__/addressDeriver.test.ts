import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { describe, expect, it } from 'vitest';
import {
  AddressFormat,
  getAddressFromMnemonic,
  getDerivationPathForAddressFormat,
} from '@/core/bitcoin/address';
import { getAddressFromPrivateKey } from '@/core/bitcoin/privateKey';
import type { WalletRecord } from '@/types/wallet';
import {
  deriveAddressesFromSecret,
  deriveAddressFromPrivateKey,
  deriveMnemonicAddress,
  generateWalletId,
  generateWalletIdFromPrivateKey,
  getPairedAddressFormats,
} from '../addressDeriver';

// Standard BIP39 test vector mnemonic.
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Private key = 1 (valid secp256k1 scalar).
const PRIV_HEX = '0000000000000000000000000000000000000000000000000000000000000001';

describe('addressDeriver', () => {
  describe('getPairedAddressFormats', () => {
    it('pairs only supported Legacy and native SegWit formats', () => {
      const supportedPairs = [
        [AddressFormat.Counterwallet, AddressFormat.CounterwalletSegwit],
        [AddressFormat.FreewalletBIP39, AddressFormat.FreewalletBIP39Segwit],
        [AddressFormat.P2PKH, AddressFormat.P2WPKH],
      ] as const;

      for (const [legacy, segwit] of supportedPairs) {
        expect(getPairedAddressFormats(legacy)).toEqual({ legacy, segwit });
        expect(getPairedAddressFormats(segwit)).toEqual({ legacy, segwit });
      }
      expect(getPairedAddressFormats(AddressFormat.P2TR)).toBeNull();
      expect(getPairedAddressFormats(AddressFormat.P2SH_P2WPKH)).toBeNull();
    });
  });

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
      // 'deadbeef' is a fixture, not a key. It used to be copied into pubKey verbatim, which is
      // how an account xpub reached compose as multisig_pubkey and came back "Invalid multisig
      // pubkey: zpub6...". Anything that is not a key is now dropped, and empty is the value
      // getSourcePubkey already reads as "no key, let core find it".
      const secret = JSON.stringify({ derivationPath: "m/84'/0'/0'/0/0", publicKey: 'deadbeef' });

      const addresses = deriveAddressesFromSecret(secret, record);
      expect(addresses).toEqual([
        { name: 'Address 1', path: "m/84'/0'/0'/0/0", address: 'bc1qhardwarepreview', pubKey: '' },
      ]);
    });

    it('keeps a stored public key that really is one', () => {
      const record = {
        type: 'hardware',
        previewAddress: 'bc1qhardwarepreview',
      } as unknown as WalletRecord;
      const PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
      const secret = JSON.stringify({ derivationPath: "m/84'/0'/0'/0/0", publicKey: PUBKEY });

      expect(deriveAddressesFromSecret(secret, record)[0]?.pubKey).toBe(PUBKEY);
    });

    it('derives the address key from a stored account xpub', () => {
      // The point of the fix: a Trezor stores the ACCOUNT key, and the address key can simply be
      // computed from it. Asserted against the key derived independently from the same seed by
      // walking the full path, so a wrong tail would not agree.
      const master = HDKey.fromMasterSeed(
        mnemonicToSeedSync(
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        ),
      );
      const expected = bytesToHex(master.derive("m/84'/0'/0'/0/0").publicKey!);
      const record = {
        type: 'hardware',
        previewAddress: 'bc1qhardwarepreview',
      } as unknown as WalletRecord;
      const secret = JSON.stringify({
        derivationPath: "m/84'/0'/0'/0/0",
        publicKey: 'wpkh([abcd/84h/0h/0h]xpub/0/*)',
        xpub: master.derive("m/84'/0'/0'").publicExtendedKey,
      });

      expect(deriveAddressesFromSecret(secret, record)[0]?.pubKey).toBe(expected);
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
      expect(addresses[0]!.address).toBe(getAddressFromPrivateKey(PRIV_HEX, AddressFormat.P2WPKH, true));
    });

    it('returns [] for malformed hardware secret', () => {
      const record = { type: 'hardware', previewAddress: 'x' } as unknown as WalletRecord;
      expect(deriveAddressesFromSecret('not-json', record)).toEqual([]);
    });
  });
});
