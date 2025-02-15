import { describe, it, expect } from 'vitest';
import {
  encryptMnemonic,
  decryptMnemonic,
  encryptPrivateKey,
  decryptPrivateKey,
} from '@/utils/encryption/walletEncryption';
import { AddressType } from '@/utils/blockchain/bitcoin';

// Use the same test data as before.
const testMnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const testPrivateKey = "5HueCGU8rMjxEXxiPuD5BDuK4kq68W5ogS9uQF3rftmLhpXcda7";
const validPassword = "correcthorsebatterystaple";

describe('Additional Wallet Encryption Tests', () => {
  it('should throw an error when encrypting a mnemonic with an empty password', async () => {
    await expect(
      encryptMnemonic(testMnemonic, "", AddressType.P2WPKH)
    ).rejects.toThrow();
  });

  it('should throw an error when encrypting a private key with an empty password', async () => {
    await expect(encryptPrivateKey(testPrivateKey, "")).rejects.toThrow();
  });

  it('should decrypt a mnemonic correctly after re-encryption', async () => {
    const encrypted = await encryptMnemonic(testMnemonic, validPassword, AddressType.P2WPKH);
    const decrypted = await decryptMnemonic(encrypted, validPassword);
    expect(decrypted).toBe(testMnemonic);
  });

  it('should decrypt a private key correctly after re-encryption', async () => {
    const encrypted = await encryptPrivateKey(testPrivateKey, validPassword);
    const decrypted = await decryptPrivateKey(encrypted, validPassword);
    expect(decrypted).toBe(testPrivateKey);
  });
});
