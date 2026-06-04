import { describe, it, expect } from 'vitest';
import { encryptKeychainRecord, decryptKeychain, KEYCHAIN_VERSION } from '../keychainCrypto';
import { deriveKey } from '@/utils/encryption/encryption';
import { generateRandomBytes, bufferToBase64 } from '@/utils/encryption/buffer';
import { DEFAULT_SETTINGS } from '@/utils/settings';
import type { Keychain } from '@/types/wallet';

const ITERATIONS = 500000; // deriveKey enforces a 500k minimum (ADR-014)

const sampleKeychain = (): Keychain => ({
  version: KEYCHAIN_VERSION,
  wallets: [],
  settings: { ...DEFAULT_SETTINGS },
});

describe('keychainCrypto', () => {
  it('round-trips a keychain through encrypt/decrypt with the same key', async () => {
    const salt = generateRandomBytes(16);
    const key = await deriveKey('correct-horse-battery', salt, ITERATIONS);
    const keychain = sampleKeychain();

    const record = await encryptKeychainRecord(keychain, key, bufferToBase64(salt), ITERATIONS);

    expect(record.version).toBe(KEYCHAIN_VERSION);
    expect(record.kdf.iterations).toBe(ITERATIONS);
    expect(record.salt).toBe(bufferToBase64(salt));
    expect(typeof record.encryptedKeychain).toBe('string');

    const decrypted = await decryptKeychain(record, key);
    expect(decrypted).toEqual(keychain);
  });

  it('fails to decrypt with the wrong key', async () => {
    const salt = generateRandomBytes(16);
    const key = await deriveKey('right-password', salt, ITERATIONS);
    const wrongKey = await deriveKey('wrong-password', salt, ITERATIONS);

    const record = await encryptKeychainRecord(sampleKeychain(), key, bufferToBase64(salt), ITERATIONS);

    await expect(decryptKeychain(record, wrongKey)).rejects.toThrow();
  });
});
