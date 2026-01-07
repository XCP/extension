import { getAllRecords, addRecord, updateRecord, updateRecords, removeRecord, StoredRecord } from '@/utils/storage/storage';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

/**
 * Interface for encrypted wallet records stored in local storage.
 */
export interface EncryptedWalletRecord extends StoredRecord {
  name: string;
  type: 'mnemonic' | 'privateKey';
  addressFormat: AddressFormat;
  addressCount?: number; // Number of derived addresses (defaults to 0 if omitted)
  encryptedSecret: string;
  previewAddress?: string;
  addressPreviews?: { [key in AddressFormat]?: string }; // Cached preview addresses for each format
  isTestOnly?: boolean; // For development-only test addresses
}

/**
 * Retrieves all wallet records that are of type 'mnemonic' or 'privateKey'.
 *
 * @returns A Promise that resolves to an array of encrypted wallet records.
 */
export async function getAllEncryptedWallets(): Promise<EncryptedWalletRecord[]> {
  const all = await getAllRecords();
  return all.filter(
    (r) => r.type === 'mnemonic' || r.type === 'privateKey'
  ) as EncryptedWalletRecord[];
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
 */
export async function updateEncryptedWallet(record: EncryptedWalletRecord): Promise<void> {
  await updateRecord(record);
}

/**
 * Updates multiple encrypted wallet records in a single operation.
 * More efficient than calling updateEncryptedWallet() multiple times.
 *
 * @param records - Array of wallet records to update.
 */
export async function updateEncryptedWallets(records: EncryptedWalletRecord[]): Promise<void> {
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
