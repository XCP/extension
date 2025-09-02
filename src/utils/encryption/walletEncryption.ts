import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import { isValidCounterwalletMnemonic } from '@/utils/blockchain/counterwallet';
import { encryptString, decryptString, DecryptionError } from '@/utils/encryption/encryption';

/**
 * Encrypts a mnemonic after validating it against the specified address type.
 *
 * @param mnemonic - The mnemonic phrase to encrypt.
 * @param password - The password used for encryption.
 * @param addressFormat - The address format (e.g. standard or Counterwallet).
 * @returns A Promise that resolves to the encrypted mnemonic (JSON string).
 * @throws Error if the password is empty or the mnemonic is invalid.
 */
export async function encryptMnemonic(
  mnemonic: string,
  password: string,
  addressFormat: AddressFormat
): Promise<string> {
  if (!password) {
    throw new Error('Password cannot be empty');
  }

  const valid =
    addressFormat === AddressFormat.Counterwallet
      ? isValidCounterwalletMnemonic(mnemonic)
      : validateMnemonic(mnemonic, wordlist);

  if (!valid) {
    throw new Error(`Invalid mnemonic for address type: ${ addressFormat }`);
  }

  return encryptString(mnemonic, password);
}

/**
 * Decrypts an encrypted mnemonic and verifies that the result is a valid mnemonic.
 *
 * @param encrypted - The encrypted mnemonic (JSON string).
 * @param password - The password used for decryption.
 * @returns A Promise that resolves to the decrypted mnemonic.
 * @throws DecryptionError if the decrypted mnemonic is invalid.
 */
export async function decryptMnemonic(
  encrypted: string,
  password: string
): Promise<string> {
  const decrypted = await decryptString(encrypted, password);

  if (!validateMnemonic(decrypted, wordlist) && !isValidCounterwalletMnemonic(decrypted)) {
    throw new DecryptionError('Decrypted mnemonic is invalid');
  }
  return decrypted;
}

/**
 * Encrypts a private key (or private key JSON string) using the provided password.
 *
 * @param privKeyData - The private key data to encrypt.
 * @param password - The encryption password.
 * @returns A Promise that resolves to the encrypted private key.
 * @throws Error if the password is empty.
 */
export async function encryptPrivateKey(
  privKeyData: string,
  password: string
): Promise<string> {
  if (!password) {
    throw new Error('Password cannot be empty');
  }
  return encryptString(privKeyData, password);
}

/**
 * Decrypts an encrypted private key using the provided password.
 *
 * @param encrypted - The encrypted private key.
 * @param password - The password for decryption.
 * @returns A Promise that resolves to the decrypted private key data.
 */
export async function decryptPrivateKey(
  encrypted: string,
  password: string
): Promise<string> {
  return decryptString(encrypted, password);
}
