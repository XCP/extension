/**
 * Wallet Storage - Encrypted wallet record persistence
 *
 * Stores encrypted wallet data (mnemonics, private keys) in local storage.
 * All secrets are encrypted before storage using password-derived keys.
 *
 * Note: This module uses the dedicated 'local:walletRecords' storage key.
 * Settings are stored separately in 'local:settingsRecord' for isolation.
 * See ADR-011 in storage.ts for details.
 */

import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

import {
  getAllRecords,
  addRecord,
  updateRecord,
  updateRecords,
  removeRecord,
  StoredRecord,
} from './storage';

/**
 * Interface for encrypted wallet records stored in local storage.
 */
export interface EncryptedWalletRecord extends StoredRecord {
  name: string;
  type: 'mnemonic' | 'privateKey';
  addressFormat: AddressFormat;
  addressCount?: number; // Number of derived addresses (defaults to 0 if omitted)
  encryptedSecret: string;
  isTestOnly?: boolean; // For development-only test addresses
}

/**
 * Retrieves all encrypted wallet records.
 *
 * Since wallets are now stored in a dedicated 'local:walletRecords' key,
 * all records are wallet records (no filtering needed).
 *
 * @returns A Promise that resolves to an array of encrypted wallet records.
 */
export async function getAllEncryptedWallets(): Promise<EncryptedWalletRecord[]> {
  return getAllRecords() as Promise<EncryptedWalletRecord[]>;
}

/**
 * Adds an encrypted wallet record to storage.
 *
 * @param record - The encrypted wallet record to add.
 * @throws Error if encryptedSecret is missing or invalid (optional validation).
 */
export async function addEncryptedWallet(record: EncryptedWalletRecord): Promise<void> {
  // Optional validation
  if (!record.encryptedSecret) {
    throw new Error('Encrypted secret is required for wallet records');
  }
  await addRecord(record);
}

/**
 * Updates an existing encrypted wallet record.
 *
 * @param record - The wallet record with updated information.
 * @throws Error if encryptedSecret is missing or invalid.
 */
export async function updateEncryptedWallet(record: EncryptedWalletRecord): Promise<void> {
  if (!record.encryptedSecret) {
    throw new Error('Encrypted secret is required for wallet records');
  }
  await updateRecord(record);
}

/**
 * Updates multiple encrypted wallet records in a single operation.
 * More efficient than calling updateEncryptedWallet() multiple times.
 *
 * @param records - Array of wallet records to update.
 * @throws Error if any record is missing encryptedSecret.
 */
export async function updateEncryptedWallets(records: EncryptedWalletRecord[]): Promise<void> {
  for (const record of records) {
    if (!record.encryptedSecret) {
      throw new Error(`Encrypted secret is required for wallet record: ${record.id}`);
    }
  }
  await updateRecords(records);
}

/**
 * Removes an encrypted wallet record by its ID.
 *
 * @param id - The ID of the wallet record to remove.
 */
export async function removeEncryptedWallet(id: string): Promise<void> {
  await removeRecord(id);
}
