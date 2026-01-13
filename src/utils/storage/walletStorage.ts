/**
 * Wallet Storage - Encrypted wallet record persistence
 *
 * Stores encrypted wallet data (mnemonics, private keys) in local storage.
 * All secrets are encrypted before storage using password-derived keys.
 * Hardware wallets store xpub data instead of encrypted secrets.
 *
 * Note: This module uses the dedicated 'local:walletRecords' storage key.
 * Settings are stored separately in 'local:settingsRecord' for isolation.
 * See ADR-011 in storage.ts for details.
 */

import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
// Import directly from constants to avoid circular dependency
import { MAX_ADDRESSES_PER_WALLET } from '@/utils/wallet/constants';
// Import wallet types from centralized types module (single source of truth)
import type { WalletType, HardwareWalletData } from '@/types/wallet';

import {
  getAllRecords,
  addRecord,
  updateRecord,
  updateRecords,
  removeRecord,
  StoredRecord,
} from './storage';

// Re-export types for backwards compatibility with existing imports
export type { WalletType, HardwareWalletData };

/**
 * Valid address format values for runtime validation.
 * Derived from the AddressFormat const object.
 */
const VALID_ADDRESS_FORMATS = new Set(Object.values(AddressFormat));

/**
 * Type guard to validate wallet record shape on read.
 * Filters out corrupted or schema-incompatible records.
 * Hardware wallets don't have encryptedSecret, they have hardwareData.
 */
function isValidWalletRecord(value: unknown): value is EncryptedWalletRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const hasBasicFields = (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.addressFormat === 'string'
  );
  if (!hasBasicFields) return false;

  // Hardware wallets have hardwareData, others have encryptedSecret
  if (obj.type === 'hardware') {
    return obj.hardwareData !== undefined && typeof obj.hardwareData === 'object';
  }
  return (
    typeof obj.encryptedSecret === 'string' &&
    (obj.type === 'mnemonic' || obj.type === 'privateKey')
  );
}

/**
 * Validates a wallet record before storage.
 * Throws if any field fails validation.
 */
function validateWalletRecord(record: EncryptedWalletRecord): void {
  // Validate based on wallet type
  if (record.type === 'hardware') {
    if (!record.hardwareData) {
      throw new Error('Hardware data is required for hardware wallet records');
    }
  } else {
    if (!record.encryptedSecret) {
      throw new Error('Encrypted secret is required for mnemonic/privateKey wallet records');
    }
  }

  if (!record.name || record.name.trim().length === 0) {
    throw new Error('Wallet name is required and cannot be empty');
  }

  if (!VALID_ADDRESS_FORMATS.has(record.addressFormat)) {
    throw new Error('Invalid address format');
  }

  if (record.addressCount !== undefined) {
    if (!Number.isInteger(record.addressCount) || record.addressCount < 0) {
      throw new Error('Address count must be a non-negative integer');
    }
    if (record.addressCount > MAX_ADDRESSES_PER_WALLET) {
      throw new Error(`Address count cannot exceed ${MAX_ADDRESSES_PER_WALLET}`);
    }
  }
}

/**
 * Interface for encrypted wallet records stored in local storage.
 */
export interface EncryptedWalletRecord extends StoredRecord {
  name: string;
  type: WalletType;
  addressFormat: AddressFormat;
  addressCount?: number; // Number of derived addresses (defaults to 0 if omitted)
  /** Encrypted mnemonic or private key (required for mnemonic/privateKey types) */
  encryptedSecret?: string;
  /** Hardware wallet data (required for hardware type) */
  hardwareData?: HardwareWalletData;
  isTestOnly?: boolean; // For development-only test addresses
}

/**
 * Retrieves all encrypted wallet records.
 *
 * Validates each record's shape to filter out corrupted or
 * schema-incompatible data from storage.
 *
 * @returns A Promise that resolves to an array of valid encrypted wallet records.
 */
export async function getAllEncryptedWallets(): Promise<EncryptedWalletRecord[]> {
  const records = await getAllRecords();
  return records.filter(isValidWalletRecord);
}

/**
 * Adds an encrypted wallet record to storage.
 *
 * @param record - The encrypted wallet record to add.
 * @throws Error if validation fails (name, addressFormat, addressCount, or type-specific fields).
 */
export async function addEncryptedWallet(record: EncryptedWalletRecord): Promise<void> {
  validateWalletRecord(record);
  await addRecord(record);
}

/**
 * Updates an existing encrypted wallet record.
 *
 * @param record - The wallet record with updated information.
 * @throws Error if validation fails (name, addressFormat, addressCount, or type-specific fields).
 */
export async function updateEncryptedWallet(record: EncryptedWalletRecord): Promise<void> {
  validateWalletRecord(record);
  await updateRecord(record);
}

/**
 * Updates multiple encrypted wallet records in a single operation.
 * More efficient than calling updateEncryptedWallet() multiple times.
 *
 * @param records - Array of wallet records to update.
 * @throws Error if any record fails validation.
 */
export async function updateEncryptedWallets(records: EncryptedWalletRecord[]): Promise<void> {
  for (const record of records) {
    validateWalletRecord(record);
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
