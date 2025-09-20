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
 * In test environments, uses a unique key to avoid test interference.
 */
const storageKey = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' 
  ? `local:appRecords_test`
  : 'local:appRecords';


const localRecords = storage.defineItem<StoredRecord[]>(storageKey, {
  fallback: [],
});

// Simple in-memory cache with invalidation
let recordsCache: StoredRecord[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5000; // 5 seconds TTL to balance performance vs freshness

/**
 * Internal helper to fetch records from storage with smart caching.
 * Uses a short-lived cache to avoid repeated storage reads within a short timeframe.
 *
 * @param forceRefresh - If true, bypasses cache and fetches from storage
 * @returns A Promise resolving to the array of stored records.
 */
async function getRecords(forceRefresh = false): Promise<StoredRecord[]> {
  const now = Date.now();
  
  // Return cached data if fresh and not forced refresh
  if (!forceRefresh && recordsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return recordsCache;
  }

  try {
    const records = await localRecords.getValue();
    // Update cache
    recordsCache = records;
    cacheTimestamp = now;
    return records;
  } catch (err) {
    // Log error for debugging but don't fail the operation
    console.error('Failed to fetch records from storage:', err);
    // Return cached data if available, otherwise empty array
    return recordsCache || [];
  }
}

/**
 * Internal helper to persist changes to storage and update cache.
 *
 * @param records - The updated array of records to persist.
 * @throws Error if storage write fails, allowing callers to handle persistence issues.
 */
async function persistRecords(records: StoredRecord[]): Promise<void> {
  try {
    await localRecords.setValue(records);
    // Update cache immediately after successful write
    recordsCache = records;
    cacheTimestamp = Date.now();
  } catch (err) {
    console.error('Failed to persist records to storage:', err);
    throw new Error('Storage update failed'); // Propagate error for caller awareness
  }
}

/**
 * Invalidates the cache, forcing next read to fetch from storage.
 * Useful when external changes to storage are expected.
 */
export function invalidateCache(): void {
  recordsCache = null;
  cacheTimestamp = 0;
}

/**
 * Retrieves all records from storage.
 * Returns a deep copy to prevent external mutations of the internal state.
 *
 * @returns A Promise resolving to an array of stored records.
 */
export async function getAllRecords(): Promise<StoredRecord[]> {
  return structuredClone(await getRecords());
}

/**
 * Retrieves a record by its ID.
 *
 * @param id - The record ID to find.
 * @returns A Promise resolving to the found record, or undefined if not found.
 */
export async function getRecordById(id: string): Promise<StoredRecord | undefined> {
  const records = await getRecords();
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
  const records = await getRecords();
  if (records.some((r) => r.id === record.id)) {
    throw new Error(`Record with ID "${record.id}" already exists.`);
  }
  records.push(record);
  await persistRecords(records);
}

/**
 * Updates an existing record in storage.
 * Replaces the matching record by ID with the new data.
 *
 * @param record - The record with updated data.
 * @throws Error if no record with the matching ID is found.
 */
export async function updateRecord(record: StoredRecord): Promise<void> {
  const records = await getRecords();
  const index = records.findIndex((r) => r.id === record.id);
  if (index === -1) {
    throw new Error(`Record with ID "${record.id}" not found.`);
  }
  records[index] = record;
  await persistRecords(records);
}

/**
 * Removes a record by its ID from storage.
 * Performs an in-place removal to optimize memory usage.
 *
 * @param id - The ID of the record to remove.
 */
export async function removeRecord(id: string): Promise<void> {
  const records = await getRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return; // No-op if record isn't found
  records.splice(index, 1);
  await persistRecords(records);
}

/**
 * Clears all records from storage.
 * Resets persistent storage to empty array.
 */
export async function clearAllRecords(): Promise<void> {
  try {
    await persistRecords([]); // Use persistRecords to clear and update cache
  } catch (err) {
    // Log failure but don't throw
    console.error('Failed to clear records from storage:', err);
  }
}
