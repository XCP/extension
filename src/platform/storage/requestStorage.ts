/**
 * Generic Request Storage - Base class for pending dApp request storage
 *
 * Provides a reusable pattern for storing pending requests from dApps
 * that need user approval (sign message, sign transaction, sign PSBT).
 *
 * Features:
 * - TTL-based expiration (requests auto-expire after 10 minutes)
 * - Write lock protection for concurrent operations
 * - Session storage (cleared on browser close)
 *
 * ### ADR-010: Storage Pattern Decisions
 *
 * This module uses a class pattern rather than the function pattern used by
 * other storage modules. The class is justified because:
 * - Generic type support (`T extends BaseRequest`) allows type-safe request storage
 * - Write lock is per-instance (each storage type has its own lock)
 * - TTL management logic is encapsulated
 * - Related functionality (store, get, remove, clear) grouped together
 *
 * Functions are appropriate for simple key-value storage where you just need get/set/clear.
 *
 * Naming conventions across storage modules:
 * - `add*()`: Adding to a collection (array)
 * - `set*()`: Replacing a single value
 * - `store*()`: Persisting with additional logic (validation, TTL)
 * - `save*()`: Alias for set (used in settings)
 */

import { createWriteLock, isExpired } from '@/platform/storage/mutex';

/**
 * Base interface for all request types.
 * All requests must have id, origin, and timestamp.
 */
export interface BaseRequest {
  id: string;
  origin: string;
  timestamp: number;
}

/**
 * A request authorized for a specific signing identity. Signing is bound to the
 * address/wallet captured here when the request was created.
 */
export interface AuthorizedRequest extends BaseRequest {
  address: string;
  walletId: string;
}

/**
 * Validates that a value has the minimum BaseRequest shape.
 */
function isValidBaseRequest(value: unknown): value is BaseRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.origin === 'string' &&
    typeof obj.timestamp === 'number' && Number.isFinite(obj.timestamp) &&
    obj.timestamp >= 0 && obj.timestamp <= Date.now()
  );
}

/**
 * Configuration for a request storage instance.
 */
interface RequestStorageConfig<T extends BaseRequest> {
  /** Storage key for chrome.storage.session */
  storageKey: string;
  /** Human-readable name for error messages */
  requestName: string;
  /** Time-to-live in milliseconds (default: 10 minutes) */
  ttlMs?: number;
  validate?: (value: unknown) => value is T;
}

/** Default TTL: 10 minutes */
const DEFAULT_REQUEST_TTL = 10 * 60 * 1000;

// Every writer for a key in the background shares one lock. Callers in other
// extension contexts submit commands to that owner instead of writing arrays.
const storageLocks = new Map<string, ReturnType<typeof createWriteLock>>();

/**
 * Generic request storage class.
 * Handles storage, retrieval, and cleanup of pending dApp requests.
 *
 * @template T - The request type, must extend BaseRequest
 */
export class RequestStorage<T extends BaseRequest> {
  private readonly storageKey: string;
  private readonly requestName: string;
  private readonly ttlMs: number;
  private readonly withWriteLock: <R>(fn: () => Promise<R>) => Promise<R>;
  private readonly validate?: (value: unknown) => value is T;

  constructor(config: RequestStorageConfig<T>) {
    this.storageKey = config.storageKey;
    this.requestName = config.requestName;
    this.ttlMs = config.ttlMs ?? DEFAULT_REQUEST_TTL;
    this.validate = config.validate;
    const lock = storageLocks.get(config.storageKey) ?? createWriteLock();
    storageLocks.set(config.storageKey, lock);
    this.withWriteLock = lock;
  }

  /**
   * Store a request.
   * Automatically cleans up expired requests.
   * Throws if session storage API is unavailable (per ADR-008).
   */
  async store(request: T): Promise<void> {
    return this.write(request, true);
  }

  /** Insert immutable request parameters; a duplicate ID cannot replace approval state. */
  async insert(request: T): Promise<void> {
    return this.write(request, false);
  }

  private async write(request: T, replace: boolean): Promise<void> {
    if (!chrome?.storage?.session) {
      throw new Error('Session storage API unavailable');
    }

    return this.withWriteLock(async () => {
      try {
        const existing = await this.getAllRaw(true);
        if (!replace && existing.some(item => item.id === request.id)) {
          throw new Error('Request ID already exists');
        }
        const requests = existing.filter(item => item.id !== request.id);
        requests.push(request);

        // Clean up expired requests
        const validRequests = requests.filter(
          r => !isExpired(r.timestamp, this.ttlMs)
        );

        await chrome.storage.session.set({
          [this.storageKey]: validRequests
        });
      } catch (err) {
        console.error(`Failed to save ${this.requestName}:`, err);
        throw new Error('Storage operation failed');
      }
    });
  }

  /**
   * Get a specific request by ID.
   * Returns null if not found or expired.
   */
  async get(id: string): Promise<T | null> {
    const requests = await this.getAll();
    return requests.find(r => r.id === id) ?? null;
  }

  /**
   * Get all valid (non-expired) requests.
   */
  async getAll(): Promise<T[]> {
    const requests = await this.getAllRaw();
    return requests.filter(r => !isExpired(r.timestamp, this.ttlMs));
  }

  /** One read/modify/write transaction, including conditional state transitions. */
  async update(id: string, change: (request: T) => T | null): Promise<T | null> {
    if (!chrome?.storage?.session) throw new Error('Session storage API unavailable');
    return this.withWriteLock(async () => {
      const requests = (await this.getAllRaw(true)).filter(item => !isExpired(item.timestamp, this.ttlMs));
      const index = requests.findIndex(item => item.id === id);
      if (index < 0) return null;
      const updated = change(requests[index]!);
      if (updated) requests[index] = updated;
      else requests.splice(index, 1);
      await chrome.storage.session.set({ [this.storageKey]: requests });
      return updated;
    });
  }

  /**
   * Get all requests without filtering (internal use).
   * Validates each item has the required BaseRequest shape.
   */
  private async getAllRaw(forWrite = false): Promise<T[]> {
    if (!chrome?.storage?.session) {
      return [];
    }

    try {
      const result = await chrome.storage.session.get(this.storageKey);
      const value = result[this.storageKey];
      if (!Array.isArray(value)) {
        return [];
      }
      // Filter to only valid requests (must have id, origin, timestamp)
      return value.filter((item): item is T => isValidBaseRequest(item)
        && (!this.validate || this.validate(item)));
    } catch (err) {
      console.error(`Failed to read ${this.requestName}s:`, err);
      // A failed read is never evidence that it is safe to overwrite the store.
      if (forWrite) throw new Error('Storage operation failed');
      return [];
    }
  }

  /**
   * Remove a request by ID.
   * Throws if session storage API is unavailable (per ADR-008).
   */
  async remove(id: string): Promise<void> {
    if (!chrome?.storage?.session) {
      throw new Error('Session storage API unavailable');
    }

    return this.withWriteLock(async () => {
      try {
        const requests = await this.getAllRaw(true);
        const filtered = requests.filter(r => r.id !== id);

        await chrome.storage.session.set({
          [this.storageKey]: filtered
        });
      } catch (err) {
        console.error(`Failed to remove ${this.requestName}:`, err);
        throw new Error('Storage operation failed');
      }
    });
  }

  /**
   * Clear all requests.
   * Throws if session storage API is unavailable (per ADR-008).
   */
  async clear(): Promise<void> {
    if (!chrome?.storage?.session) {
      throw new Error('Session storage API unavailable');
    }

    return this.withWriteLock(async () => {
      try {
        await chrome.storage.session.set({
          [this.storageKey]: []
        });
      } catch (err) {
        console.error(`Failed to clear ${this.requestName}s:`, err);
        throw new Error('Storage operation failed');
      }
    });
  }
}
