import { describe, it, expect } from 'vitest';
import { encryptString, decryptString, DecryptionError } from '@/utils/encryption/encryption';

describe('encryptString and decryptString', () => {
  const plaintext = 'This is a secret message';
  const password = 'supersecret123';

  it('should encrypt and then decrypt to the original plaintext', async () => {
    const encrypted = await encryptString(plaintext, password);
    expect(typeof encrypted).toBe('string');

    const decrypted = await decryptString(encrypted, password);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw an error if an empty password is used during encryption', async () => {
    await expect(encryptString(plaintext, '')).rejects.toThrow('Password cannot be empty');
  });

  it('should throw a DecryptionError when decrypting with a wrong password', async () => {
    const encrypted = await encryptString(plaintext, password);
    await expect(decryptString(encrypted, 'wrongpassword')).rejects.toThrow(DecryptionError);
  });
});
