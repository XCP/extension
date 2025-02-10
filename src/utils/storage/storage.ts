import { storage } from 'wxt/storage';

/**
 * Generic interface for items stored in local storage.
 * Extend this interface for more specific record types.
 */
export interface StoredRecord {
  id: string;
  [key: string]: any; // Allows arbitrary additional fields.
}

/**
 * Defines a storage item for an array of records.
 * Uses the key 'local:appRecords' in local storage with a fallback of an empty array.
 */
const localRecords = storage.defineItem<StoredRecord[]>('local:appRecords', {
  fallback: [],
});

/**
 * Retrieves all records from storage.
 *
 * @returns A Promise that resolves to an array of stored records.
 */
export async function getAllRecords(): Promise<StoredRecord[]> {
  return localRecords.getValue();
}

/**
 * Retrieves a record by its ID.
 *
 * @param id - The record ID to find.
 * @returns A Promise that resolves to the found record, or undefined if not found.
 */
export async function getRecordById(id: string): Promise<StoredRecord | undefined> {
  const records = await getAllRecords();
  return records.find((r) => r.id === id);
}

/**
 * Adds a new record to storage.
 *
 * @param record - The record to add.
 * @throws Error if a record with the same ID already exists.
 */
export async function addRecord(record: StoredRecord): Promise<void> {
  const records = await getAllRecords();
  if (records.some((r) => r.id === record.id)) {
    throw new Error(`Record with ID "${record.id}" already exists.`);
  }
  records.push(record);
  await localRecords.setValue(records);
}

/**
 * Updates an existing record in storage.
 *
 * @param record - The record with updated data.
 * @throws Error if no record with the matching ID is found.
 */
export async function updateRecord(record: StoredRecord): Promise<void> {
  const records = await getAllRecords();
  const index = records.findIndex((r) => r.id === record.id);
  if (index === -1) {
    throw new Error(`Record with ID "${record.id}" not found.`);
  }
  records[index] = record;
  await localRecords.setValue(records);
}

/**
 * Removes a record by its ID from storage.
 *
 * @param id - The ID of the record to remove.
 */
export async function removeRecord(id: string): Promise<void> {
  const records = (await getAllRecords()).filter((r) => r.id !== id);
  await localRecords.setValue(records);
}

/**
 * Clears all records from storage.
 */
export async function clearAllRecords(): Promise<void> {
  await localRecords.removeValue();
}
