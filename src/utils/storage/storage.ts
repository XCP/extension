import { storage } from '#imports';

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

// In-memory cache to reduce redundant storage reads.
// Initialized as null and populated on first access.
let cachedRecords: StoredRecord[] | null = null;

/**
 * Internal helper to fetch records from storage, utilizing an in-memory cache.
 * If the cache is null, it retrieves from storage and caches the result.
 * Handles storage failures gracefully by falling back to an empty array.
 *
 * @returns A Promise resolving to the array of stored records.
 */
async function getCachedRecords(): Promise<StoredRecord[]> {
  if (cachedRecords === null) {
    try {
      cachedRecords = await localRecords.getValue();
    } catch (err) {
      // Log error for debugging but don't fail the operation
      console.error('Failed to fetch records from storage:', err);
      cachedRecords = []; // Fallback to empty array on failure
    }
  }
  return cachedRecords;
}

/**
 * Internal helper to update the cache and persist changes to storage.
 * Ensures the cache stays in sync with persistent storage.
 *
 * @param records - The updated array of records to persist.
 * @throws Error if storage write fails, allowing callers to handle persistence issues.
 */
async function updateAndPersistRecords(records: StoredRecord[]): Promise<void> {
  cachedRecords = records;
  try {
    await localRecords.setValue(records);
  } catch (err) {
    console.error('Failed to persist records to storage:', err);
    throw new Error('Storage update failed'); // Propagate error for caller awareness
  }
}

/**
 * Retrieves all records from storage.
 * Returns a deep copy to prevent external mutations of the internal state.
 *
 * @returns A Promise resolving to an array of stored records.
 */
export async function getAllRecords(): Promise<StoredRecord[]> {
  return structuredClone(await getCachedRecords());
}

/**
 * Retrieves a record by its ID.
 * Uses the cached records for efficient lookup.
 *
 * @param id - The record ID to find.
 * @returns A Promise resolving to the found record, or undefined if not found.
 */
export async function getRecordById(id: string): Promise<StoredRecord | undefined> {
  const records = await getCachedRecords();
  return records.find((r) => r.id === id);
}

/**
 * Adds a new record to storage.
 * Checks for duplicate IDs before adding to maintain uniqueness.
 *
 * @param record - The record to add.
 * @throws Error if a record with the same ID already exists.
 */
export async function addRecord(record: StoredRecord): Promise<void> {
  const records = await getCachedRecords();
  if (records.some((r) => r.id === record.id)) {
    throw new Error(`Record with ID "${record.id}" already exists.`);
  }
  records.push(record); // Append to the in-memory array
  await updateAndPersistRecords(records);
}

/**
 * Updates an existing record in storage.
 * Replaces the matching record by ID with the new data.
 *
 * @param record - The record with updated data.
 * @throws Error if no record with the matching ID is found.
 */
export async function updateRecord(record: StoredRecord): Promise<void> {
  const records = await getCachedRecords();
  const index = records.findIndex((r) => r.id === record.id);
  if (index === -1) {
    throw new Error(`Record with ID "${record.id}" not found.`);
  }
  records[index] = record; // Replace the existing record
  await updateAndPersistRecords(records);
}

/**
 * Removes a record by its ID from storage.
 * Performs an in-place removal to optimize memory usage.
 *
 * @param id - The ID of the record to remove.
 */
export async function removeRecord(id: string): Promise<void> {
  const records = await getCachedRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return; // No-op if record isn’t found
  records.splice(index, 1); // Remove in-place for efficiency
  await updateAndPersistRecords(records);
}

/**
 * Clears all records from storage.
 * Resets both the cache and persistent storage.
 */
export async function clearAllRecords(): Promise<void> {
  cachedRecords = null; // Reset cache immediately
  try {
    await localRecords.removeValue();
  } catch (err) {
    // Log failure but don’t throw, as cache is already cleared
    console.error('Failed to clear records from storage:', err);
  }
}
