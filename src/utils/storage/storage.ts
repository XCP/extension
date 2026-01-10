/**
 * Storage Layer - IndexedDB persistence with mutex protection
 *
 * ## Architecture Decision Records
 *
 * ### ADR-005: Promise-Based Write Mutex
 *
 * **Context**: Concurrent storage operations can cause race conditions where
 * one write overwrites another's changes (read-modify-write pattern).
 *
 * **Decision**: Implement a promise-based mutex to serialize write operations.
 *
 * **Rationale**:
 * - MetaMask uses `await-semaphore` for similar protection
 * - Promise-based mutex is zero-dependency and sufficient for single-context use
 * - All storage operations happen in the background service worker (same JS context)
 * - Web Locks API is an alternative but adds complexity for cross-tab scenarios we don't need
 *
 * **Implementation**:
 * - `withWriteLock()` ensures only one write operation executes at a time
 * - Read operations don't need locking (cache provides consistency within TTL)
 * - Write operations chain on the previous lock promise
 *
 * **Trade-offs**:
 * - Slight latency increase for rapid sequential writes (serialization overhead)
 * - Acceptable because wallet operations are user-initiated and infrequent
 */

import { storage } from '#imports';
import { createWriteLock } from './mutex';
import { TTLCache, CacheTTL } from '@/utils/cache';

/**
 * Generic interface for items stored in local storage.
 * Extend this interface for more specific record types.
 */
export interface StoredRecord {
  id: string;
  [key: string]: unknown; // Allows arbitrary additional fields
}

/**
 * Write lock for serializing local storage operations.
 * Uses shared mutex implementation from ./mutex.ts
 */
const withWriteLock = createWriteLock();

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

/**
 * In-memory cache for records with 5s TTL.
 * Uses structuredClone for deep copying to prevent mutation.
 */
const recordsCache = new TTLCache<StoredRecord[]>(CacheTTL.SHORT, structuredClone);

/**
 * Internal helper to fetch records from storage with smart caching.
 * Uses a short-lived cache to avoid repeated storage reads within a short timeframe.
 *
 * @param forceRefresh - If true, bypasses cache and fetches from storage
 * @returns A Promise resolving to the array of stored records.
 */
async function getRecords(forceRefresh = false): Promise<StoredRecord[]> {
  // Invalidate cache if forced refresh
  if (forceRefresh) {
    recordsCache.invalidate();
  }

  // Return cached data if available (TTLCache handles expiry)
  const cached = recordsCache.get();
  if (cached !== null) {
    return cached;
  }

  try {
    const records = await localRecords.getValue();
    // Update cache
    recordsCache.set(records);
    return records;
  } catch (err) {
    // Log error for debugging but don't fail the operation
    console.error('Failed to fetch records from storage:', err);
    // Return empty array on error (cache was already checked above)
    return [];
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
    recordsCache.set(records);
  } catch (err) {
    console.error('Failed to persist records to storage:', err);
    throw new Error('Storage update failed'); // Propagate error for caller awareness
  }
}


/**
 * Retrieves all records from storage.
 * Returns a deep copy to prevent external mutations of the internal state.
 * (TTLCache already clones on get, so no additional clone needed)
 *
 * @returns A Promise resolving to an array of stored records.
 */
export async function getAllRecords(): Promise<StoredRecord[]> {
  return getRecords();
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
 * Protected by write mutex to prevent race conditions.
 *
 * @param record - The record to add.
 * @throws Error if a record with the same ID already exists.
 */
export async function addRecord(record: StoredRecord): Promise<void> {
  return withWriteLock(async () => {
    const records = await getRecords(true); // Force refresh under lock
    if (records.some((r) => r.id === record.id)) {
      throw new Error(`Record with ID "${record.id}" already exists.`);
    }
    records.push(record);
    await persistRecords(records);
  });
}

/**
 * Updates an existing record in storage.
 * Replaces the matching record by ID with the new data.
 * Protected by write mutex to prevent race conditions.
 *
 * @param record - The record with updated data.
 * @throws Error if no record with the matching ID is found.
 */
export async function updateRecord(record: StoredRecord): Promise<void> {
  return withWriteLock(async () => {
    const records = await getRecords(true); // Force refresh under lock
    const index = records.findIndex((r) => r.id === record.id);
    if (index === -1) {
      throw new Error(`Record with ID "${record.id}" not found.`);
    }
    records[index] = record;
    await persistRecords(records);
  });
}

/**
 * Updates multiple records in storage in a single operation.
 * More efficient than calling updateRecord() multiple times.
 * Protected by write mutex to prevent race conditions.
 *
 * @param updates - Array of records to update.
 * @throws Error if any record ID is not found.
 */
export async function updateRecords(updates: StoredRecord[]): Promise<void> {
  if (updates.length === 0) return;

  return withWriteLock(async () => {
    const records = await getRecords(true); // Force refresh under lock

    for (const update of updates) {
      const index = records.findIndex((r) => r.id === update.id);
      if (index === -1) {
        throw new Error(`Record with ID "${update.id}" not found.`);
      }
      records[index] = update;
    }

    await persistRecords(records);
  });
}

/**
 * Removes a record by its ID from storage.
 * Performs an in-place removal to optimize memory usage.
 * Protected by write mutex to prevent race conditions.
 *
 * @param id - The ID of the record to remove.
 */
export async function removeRecord(id: string): Promise<void> {
  return withWriteLock(async () => {
    const records = await getRecords(true); // Force refresh under lock
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return; // No-op if record isn't found
    records.splice(index, 1);
    await persistRecords(records);
  });
}

/**
 * Clears all records from storage.
 * Resets persistent storage to empty array.
 * Protected by write mutex to prevent race conditions.
 */
export async function clearAllRecords(): Promise<void> {
  return withWriteLock(async () => {
    try {
      await persistRecords([]); // Use persistRecords to clear and update cache
    } catch (err) {
      // Log failure but don't throw
      console.error('Failed to clear records from storage:', err);
    }
  });
}
