// src/__tests__/walletEncryption.test.ts

import { describe, it, expect } from 'vitest';
import {
  encryptMnemonic,
  decryptMnemonic,
  encryptPrivateKey,
  decryptPrivateKey,
} from '@/utils/encryption/walletEncryption';
import { AddressType } from '@/utils/blockchain/bitcoin';

// A hard-coded example mnemonic (this is a common test mnemonic)
const testMnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// An example private key in WIF format (this is for testing only)
const testPrivateKey = "5HueCGU8rMjxEXxiPuD5BDuK4kq68W5ogS9uQF3rftmLhpXcda7";

const correctPassword = "correcthorsebatterystaple";
const wrongPassword = "incorrectpassword";

describe('Wallet Encryption/Decryption', () => {
  it('should encrypt and decrypt a mnemonic successfully', async () => {
    const encrypted = await encryptMnemonic(testMnemonic, correctPassword, AddressType.P2WPKH);
    const decrypted = await decryptMnemonic(encrypted, correctPassword);
    expect(decrypted).toBe(testMnemonic);
  });

  it('should throw an error when decrypting a mnemonic with a wrong password', async () => {
    const encrypted = await encryptMnemonic(testMnemonic, correctPassword, AddressType.P2WPKH);
    await expect(decryptMnemonic(encrypted, wrongPassword)).rejects.toThrow();
  });

  it('should encrypt and decrypt a private key successfully', async () => {
    const encrypted = await encryptPrivateKey(testPrivateKey, correctPassword);
    const decrypted = await decryptPrivateKey(encrypted, correctPassword);
    expect(decrypted).toBe(testPrivateKey);
  });

  it('should throw an error when decrypting a private key with a wrong password', async () => {
    const encrypted = await encryptPrivateKey(testPrivateKey, correctPassword);
    await expect(decryptPrivateKey(encrypted, wrongPassword)).rejects.toThrow();
  });
});
