import { getAllRecords, addRecord, updateRecord, removeRecord, StoredRecord } from '@/utils/storage';
import { AddressType } from '@/utils/blockchain/bitcoin';

/**
 * Interface for encrypted wallet records stored in local storage.
 */
export interface EncryptedWalletRecord extends StoredRecord {
  name: string;
  type: 'mnemonic' | 'privateKey';
  addressType: AddressType;
  addressCount?: number;
  encryptedSecret: string;
  pinnedAssetBalances?: string[];
  previewAddress?: string;
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
 */
export async function addEncryptedWallet(record: EncryptedWalletRecord): Promise<void> {
  // Additional validation (such as duplication) can be added here if needed.
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
 * Removes an encrypted wallet record by its ID.
 *
 * @param id - The ID of the wallet record to remove.
 */
export async function removeEncryptedWalletRecord(id: string): Promise<void> {
  await removeRecord(id);
}
