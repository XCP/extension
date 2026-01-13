/**
 * Replay Prevention System
 * 
 * Prevents transaction replay attacks by tracking nonces, idempotency keys,
 * and broadcasted transaction hashes.
 */


// Types for replay prevention
interface TransactionRecord {
  txid: string;
  timestamp: number;
  origin: string;
  method: string;
  params: string; // JSON stringified params for comparison
  idempotencyKey?: string;
  nonce?: string;
  status: 'pending' | 'broadcasted' | 'failed';
}

interface NonceRecord {
  origin: string;
  address: string;
  nonce: number;
  timestamp: number;
}

interface IdempotencyRecord {
  key: string;
  origin: string;
  method: string;
  response: unknown;
  timestamp: number;
  expiresAt: number;
}

// Constants for input validation and limits
const MAX_ORIGIN_LENGTH = 2048;  // URL max practical length
const MAX_ADDRESS_LENGTH = 128;  // Bitcoin addresses are ~34-62 chars
const MAX_METHOD_LENGTH = 128;   // API method names
const MAX_TXID_LENGTH = 128;     // Transaction IDs
const MAX_PARAMS_STRING_LENGTH = 10240;  // 10KB max for serialized params

/**
 * Creates a collision-resistant key for origin:address pairs.
 * Uses JSON.stringify to avoid collision when either contains delimiters.
 */
function createNonceKey(origin: string, address: string): string {
  return JSON.stringify([origin, address]);
}

/**
 * Truncates a string to a maximum length, appending indicator if truncated.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 12) + '[truncated]';
}

/**
 * Validates that a string parameter is present and within length limits.
 * Returns the value or a safe default for defense-in-depth.
 */
function validateStringParam(value: unknown, maxLength: number, defaultValue: string): string {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  if (value.length > maxLength) {
    return truncateString(value, maxLength);
  }
  return value;
}

/**
 * Validates that a nonce parameter is a finite positive integer.
 * Returns undefined if invalid.
 */
function validateNonceParam(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  if (!Number.isInteger(value)) return undefined;
  return value;
}

// In-memory storage (could be persisted to browser.storage if needed)
class ReplayPreventionStore {
  private transactions = new Map<string, TransactionRecord>();
  private nonces = new Map<string, NonceRecord>(); // key: JSON.stringify([origin, address])
  private idempotencyKeys = new Map<string, IdempotencyRecord>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired records every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    const TRANSACTION_RETENTION = 7 * 24 * 60 * 60 * 1000; // 7 days
    const NONCE_RETENTION = 24 * 60 * 60 * 1000; // 24 hours
    
    // Cleanup old transactions
    for (const [txid, record] of this.transactions.entries()) {
      if (now - record.timestamp > TRANSACTION_RETENTION) {
        this.transactions.delete(txid);
      }
    }
    
    // Cleanup old nonces
    for (const [key, record] of this.nonces.entries()) {
      if (now - record.timestamp > NONCE_RETENTION) {
        this.nonces.delete(key);
      }
    }
    
    // Cleanup expired idempotency keys
    for (const [key, record] of this.idempotencyKeys.entries()) {
      if (now > record.expiresAt) {
        this.idempotencyKeys.delete(key);
      }
    }
  }

  addTransaction(record: TransactionRecord): void {
    this.transactions.set(record.txid, record);
  }

  getTransaction(txid: string): TransactionRecord | undefined {
    return this.transactions.get(txid);
  }

  hasTransaction(txid: string): boolean {
    return this.transactions.has(txid);
  }

  updateTransactionStatus(txid: string, status: TransactionRecord['status']): void {
    const record = this.transactions.get(txid);
    if (record) {
      record.status = status;
    }
  }

  setNonce(origin: string, address: string, nonce: number): void {
    const key = createNonceKey(origin, address);
    this.nonces.set(key, {
      origin,
      address,
      nonce,
      timestamp: Date.now()
    });
  }

  getNonce(origin: string, address: string): number {
    const key = createNonceKey(origin, address);
    const record = this.nonces.get(key);
    return record ? record.nonce : 0;
  }

  addIdempotencyKey(record: IdempotencyRecord): void {
    this.idempotencyKeys.set(record.key, record);
  }

  getIdempotencyResult(key: string): unknown | undefined {
    const record = this.idempotencyKeys.get(key);
    if (record && Date.now() <= record.expiresAt) {
      return record.response;
    }
    return undefined;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global store instance
const store = new ReplayPreventionStore();

/**
 * Generate a secure nonce for the given origin and address.
 * Input validation ensures defense-in-depth even if callers don't validate.
 */
export function generateNonce(origin: string, address: string): number {
  // Validate and sanitize inputs
  const safeOrigin = validateStringParam(origin, MAX_ORIGIN_LENGTH, 'unknown');
  const safeAddress = validateStringParam(address, MAX_ADDRESS_LENGTH, 'unknown');

  const currentNonce = store.getNonce(safeOrigin, safeAddress);
  const newNonce = currentNonce + 1;
  store.setNonce(safeOrigin, safeAddress, newNonce);
  return newNonce;
}

/**
 * Validate that a nonce is the expected next nonce.
 * Input validation ensures defense-in-depth even if callers don't validate.
 */
export function validateNonce(origin: string, address: string, providedNonce: number): boolean {
  // Validate and sanitize inputs
  const safeOrigin = validateStringParam(origin, MAX_ORIGIN_LENGTH, 'unknown');
  const safeAddress = validateStringParam(address, MAX_ADDRESS_LENGTH, 'unknown');
  const safeNonce = validateNonceParam(providedNonce);

  // Invalid nonce format always fails validation
  if (safeNonce === undefined) {
    return false;
  }

  const expectedNonce = store.getNonce(safeOrigin, safeAddress) + 1;
  return safeNonce === expectedNonce;
}

/**
 * Generate an idempotency key from request parameters using crypto.subtle.
 *
 * Note: crypto.subtle is guaranteed to be available in Chrome extension context
 * (Chrome requires secure context). We don't need availability checks.
 */
async function generateIdempotencyKeyAsync(origin: string, method: string, params: unknown[]): Promise<string> {
  // Safely stringify params - use fallback if circular refs or other issues
  let paramsString: string;
  try {
    paramsString = JSON.stringify(params);
  } catch {
    paramsString = '[unserializable]';
  }
  const timestamp = Math.floor(Date.now() / 1000); // Second precision
  const input = `${origin}:${method}:${paramsString}:${timestamp}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Take first 16 bytes for a reasonable key length
  const hashHex = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  return `idem_${hashHex}_${timestamp}`;
}

/**
 * Synchronous version for backward compatibility - uses simple hash
 * @deprecated Use generateIdempotencyKeyAsync when possible
 */
function generateIdempotencyKeyInternal(origin: string, method: string, params: unknown[]): string {
  // Safely stringify params - use fallback if circular refs or other issues
  let paramsString: string;
  try {
    paramsString = JSON.stringify(params);
  } catch {
    paramsString = '[unserializable]';
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${origin}:${method}:${paramsString}:${timestamp}`;

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `idem_${Math.abs(hash).toString(36)}_${timestamp}`;
}

// Export both versions
export const generateIdempotencyKey = generateIdempotencyKeyInternal;
export { generateIdempotencyKeyAsync };

/**
 * Check if a request is a replay based on various criteria
 */
export async function checkReplayAttempt(
  origin: string,
  method: string,
  params: unknown[],
  options: {
    requireNonce?: boolean;
    nonce?: number;
    address?: string;
    idempotencyKey?: string;
  } = {}
): Promise<{
  isReplay: boolean;
  reason?: string;
  cachedResponse?: unknown;
}> {
  const { requireNonce = false, nonce, address, idempotencyKey } = options;
  
  try {
    // Check idempotency key if provided
    if (idempotencyKey) {
      const cachedResult = store.getIdempotencyResult(idempotencyKey);
      if (cachedResult) {
        // Analytics: replay_prevented
        
        return {
          isReplay: true,
          reason: 'Request with same idempotency key already processed',
          cachedResponse: cachedResult
        };
      }
    }
    
    // Check nonce if required
    if (requireNonce && nonce !== undefined && address) {
      if (!validateNonce(origin, address, nonce)) {
        // Analytics: replay_prevented
        // Note: Generic error message to avoid leaking expected nonce value
        return {
          isReplay: true,
          reason: 'Invalid nonce'
        };
      }
    }
    
    // Check for identical recent requests
    const paramsString = JSON.stringify(params);
    const recentThreshold = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    for (const [txid, record] of store['transactions'].entries()) {
      if (
        record.origin === origin &&
        record.method === method &&
        record.params === paramsString &&
        (now - record.timestamp) < recentThreshold &&
        record.status !== 'failed'
      ) {
        // Analytics: replay_prevented
        
        return {
          isReplay: true,
          reason: 'Identical request made within the last 5 minutes'
        };
      }
    }
    
    return { isReplay: false };
    
  } catch (error) {
    // Fail closed: if we can't verify it's not a replay, reject for safety
    console.error('Error checking replay attempt:', error);
    return { isReplay: true, reason: 'Internal error - request blocked for safety' };
  }
}

/**
 * Record a transaction to prevent replay
 */
export function recordTransaction(
  txid: string,
  origin: string,
  method: string,
  params: unknown[],
  options: {
    idempotencyKey?: string;
    nonce?: string;
    status?: TransactionRecord['status'];
  } = {}
): void {
  const { idempotencyKey, nonce, status = 'pending' } = options;

  // Safely stringify params - use fallback if circular refs or other issues
  let paramsString: string;
  try {
    paramsString = JSON.stringify(params);
  } catch {
    paramsString = '[unserializable]';
  }

  // Truncate fields to prevent memory exhaustion from large inputs
  const record: TransactionRecord = {
    txid: truncateString(txid, MAX_TXID_LENGTH),
    timestamp: Date.now(),
    origin: truncateString(origin, MAX_ORIGIN_LENGTH),
    method: truncateString(method, MAX_METHOD_LENGTH),
    params: truncateString(paramsString, MAX_PARAMS_STRING_LENGTH),
    idempotencyKey,
    nonce,
    status
  };

  store.addTransaction(record);
}

/**
 * Record successful idempotency key response
 */
export function recordIdempotencyResponse(
  key: string,
  origin: string,
  method: string,
  response: unknown,
  ttlMinutes: number = 60
): void {
  const record: IdempotencyRecord = {
    key,
    origin,
    method,
    response,
    timestamp: Date.now(),
    expiresAt: Date.now() + (ttlMinutes * 60 * 1000)
  };
  
  store.addIdempotencyKey(record);
}

/**
 * Check if a transaction hash has already been broadcasted
 */
export function isTransactionBroadcasted(txid: string): boolean {
  const record = store.getTransaction(txid);
  return record ? record.status === 'broadcasted' : false;
}

/**
 * Mark a transaction as broadcasted
 */
export function markTransactionBroadcasted(txid: string): void {
  store.updateTransactionStatus(txid, 'broadcasted');
}

/**
 * Mark a transaction as failed
 */
export function markTransactionFailed(txid: string): void {
  store.updateTransactionStatus(txid, 'failed');
}

/**
 * Get transaction statistics for monitoring
 */
export function getTransactionStats(): {
  total: number;
  pending: number;
  broadcasted: number;
  failed: number;
  recentReplays: number;
} {
  const transactions = Array.from(store['transactions'].values());
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  
  return {
    total: transactions.length,
    pending: transactions.filter(t => t.status === 'pending').length,
    broadcasted: transactions.filter(t => t.status === 'broadcasted').length,
    failed: transactions.filter(t => t.status === 'failed').length,
    recentReplays: 0 // This would need additional tracking
  };
}

/**
 * Clear all replay prevention data (for testing or reset)
 */
export function clearReplayPreventionData(): void {
  store['transactions'].clear();
  store['nonces'].clear();
  store['idempotencyKeys'].clear();
}

/**
 * Enhanced request wrapper with replay prevention
 */
export async function withReplayPrevention<T>(
  origin: string,
  method: string,
  params: unknown[],
  handler: () => Promise<T>,
  options: {
    requireNonce?: boolean;
    address?: string;
    generateIdempotencyKey?: boolean;
    idempotencyTtlMinutes?: number;
  } = {}
): Promise<T> {
  const {
    requireNonce = false,
    address,
    generateIdempotencyKey = false,
    idempotencyTtlMinutes = 60
  } = options;
  
  // Generate nonce if required
  let nonce: number | undefined;
  let nonceWasGenerated = false;
  if (requireNonce && address) {
    // Get the next expected nonce without incrementing yet
    const currentNonce = store.getNonce(origin, address);
    nonce = currentNonce + 1;
    nonceWasGenerated = true;
  }
  
  // Generate idempotency key if requested (using secure async version)
  let idempotencyKey: string | undefined;
  if (generateIdempotencyKey) {
    idempotencyKey = await generateIdempotencyKeyAsync(origin, method, params);
  }
  
  // Check for replay attempts
  const replayCheck = await checkReplayAttempt(origin, method, params, {
    requireNonce,
    nonce,
    address,
    idempotencyKey
  });
  
  if (replayCheck.isReplay) {
    if (replayCheck.cachedResponse) {
      // Return cached response for idempotent requests
      // Type assertion: cachedResponse was stored as T, returning as T
      return replayCheck.cachedResponse as T;
    } else {
      // Reject replay attempts
      throw new Error(`Request rejected: ${replayCheck.reason}`);
    }
  }
  
  try {
    // Execute the handler
    const result = await handler();
    
    // Store the nonce after successful execution (only if we generated it)
    if (nonceWasGenerated && nonce !== undefined && address) {
      store.setNonce(origin, address, nonce);
    }
    
    // Record successful idempotency response if applicable
    if (idempotencyKey) {
      recordIdempotencyResponse(
        idempotencyKey,
        origin,
        method,
        result,
        idempotencyTtlMinutes
      );
    }
    
    return result;
    
  } catch (error) {
    // Track failed requests
    // Analytics: request_failed
    
    throw error;
  }
}

// Export the store for testing purposes
export const _testStore = store;