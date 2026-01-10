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
 */

import { createWriteLock, isExpired } from './mutex';

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
 * Configuration for a request storage instance.
 */
interface RequestStorageConfig {
  /** Storage key for chrome.storage.session */
  storageKey: string;
  /** Human-readable name for error messages */
  requestName: string;
  /** Time-to-live in milliseconds (default: 10 minutes) */
  ttlMs?: number;
}

/** Default TTL: 10 minutes */
const DEFAULT_REQUEST_TTL = 10 * 60 * 1000;

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

  constructor(config: RequestStorageConfig) {
    this.storageKey = config.storageKey;
    this.requestName = config.requestName;
    this.ttlMs = config.ttlMs ?? DEFAULT_REQUEST_TTL;
    this.withWriteLock = createWriteLock();
  }

  /**
   * Store a request.
   * Automatically cleans up expired requests.
   */
  async store(request: T): Promise<void> {
    return this.withWriteLock(async () => {
      try {
        const requests = await this.getAllRaw();
        requests.push(request);

        // Clean up expired requests
        const validRequests = requests.filter(
          r => !isExpired(r.timestamp, this.ttlMs)
        );

        await chrome.storage.session.set({
          [this.storageKey]: validRequests
        });
      } catch (err) {
        console.error(`Failed to store ${this.requestName}:`, err);
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

  /**
   * Get all requests without filtering (internal use).
   */
  private async getAllRaw(): Promise<T[]> {
    try {
      const result = await chrome.storage.session.get(this.storageKey);
      return (result[this.storageKey] as T[] | undefined) ?? [];
    } catch (err) {
      console.error(`Failed to read ${this.requestName}s:`, err);
      return [];
    }
  }

  /**
   * Remove a request by ID.
   */
  async remove(id: string): Promise<void> {
    return this.withWriteLock(async () => {
      try {
        const requests = await this.getAllRaw();
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
   */
  async clear(): Promise<void> {
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
