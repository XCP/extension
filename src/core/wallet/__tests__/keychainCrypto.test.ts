import { describe, expect, it } from 'vitest';
import { bufferToBase64, generateRandomBytes } from '@/core/encryption/buffer';
import { deriveKey, encryptJsonWithKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import type { Keychain } from '@/types/wallet';
import { decryptKeychain, encryptKeychainRecord, KEYCHAIN_VERSION, parseKeychain } from '../keychainCrypto';

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

  it('rejects authenticated JSON with an invalid keychain shape', async () => {
    const salt = generateRandomBytes(16);
    const key = await deriveKey('correct-horse-battery', salt, ITERATIONS);
    const encryptedKeychain = await encryptJsonWithKey(null, key);
    await expect(decryptKeychain({
      version: 1, salt: bufferToBase64(salt), kdf: { iterations: ITERATIONS }, encryptedKeychain,
    }, key)).rejects.toThrow('Invalid keychain data');
  });

  it('backfills settings missing from an older v1 keychain', () => {
    const parsed = parseKeychain({ version: 1, wallets: [], settings: { autoLockTimer: '15m' } });
    expect(parsed.settings.autoLockTimer).toBe('15m');
    expect(parsed.settings.strictTransactionVerification).toBe(true);
    expect(parsed.settings.providerCapabilities).toEqual({});
  });

  it.each([
    null,
    { version: 1, wallets: {}, settings: {} },
    { version: 1, wallets: [], settings: { autoLockTimer: 'forever' } },
    { version: 1, wallets: [], settings: { strictTransactionVerification: 'false' } },
    { version: 1, wallets: [], settings: { trezorEmulatorMode: 'true' } },
    { version: 1, wallets: [], settings: { providerCapabilities: { 'https://example.com': { pairedAddresses: 1 } } } },
  ])('rejects malformed keychain data without including decrypted values: %j', value => {
    expect(() => parseKeychain(value)).toThrow('Invalid keychain data');
  });

  it('rejects unsupported versions before returning a typed keychain', () => {
    expect(() => parseKeychain({ version: 2, wallets: [], settings: {} })).toThrow('Unsupported keychain version');
  });
});
