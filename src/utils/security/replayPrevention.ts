/**
 * Replay Prevention System
 * 
 * Prevents transaction replay attacks by tracking nonces, idempotency keys,
 * and broadcasted transaction hashes.
 */

import { trackEvent } from '@/utils/fathom';

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
  response: any;
  timestamp: number;
  expiresAt: number;
}

// In-memory storage (could be persisted to browser.storage if needed)
class ReplayPreventionStore {
  private transactions = new Map<string, TransactionRecord>();
  private nonces = new Map<string, NonceRecord>(); // key: `${origin}:${address}`
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
    const key = `${origin}:${address}`;
    this.nonces.set(key, {
      origin,
      address,
      nonce,
      timestamp: Date.now()
    });
  }

  getNonce(origin: string, address: string): number {
    const key = `${origin}:${address}`;
    const record = this.nonces.get(key);
    return record ? record.nonce : 0;
  }

  addIdempotencyKey(record: IdempotencyRecord): void {
    this.idempotencyKeys.set(record.key, record);
  }

  getIdempotencyResult(key: string): any | undefined {
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
 * Generate a secure nonce for the given origin and address
 */
export function generateNonce(origin: string, address: string): number {
  const currentNonce = store.getNonce(origin, address);
  const newNonce = currentNonce + 1;
  store.setNonce(origin, address, newNonce);
  return newNonce;
}

/**
 * Validate that a nonce is the expected next nonce
 */
export function validateNonce(origin: string, address: string, providedNonce: number): boolean {
  const expectedNonce = store.getNonce(origin, address) + 1;
  return providedNonce === expectedNonce;
}

/**
 * Generate an idempotency key from request parameters
 */
function generateIdempotencyKeyInternal(origin: string, method: string, params: any[]): string {
  const paramsString = JSON.stringify(params);
  const timestamp = Math.floor(Date.now() / 1000); // Second precision
  const input = `${origin}:${method}:${paramsString}:${timestamp}`;
  
  // Simple hash function (in production, consider using crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `idem_${Math.abs(hash).toString(36)}_${timestamp}`;
}

// Export with original name for backward compatibility
export const generateIdempotencyKey = generateIdempotencyKeyInternal;

/**
 * Check if a request is a replay based on various criteria
 */
export async function checkReplayAttempt(
  origin: string,
  method: string,
  params: any[],
  options: {
    requireNonce?: boolean;
    nonce?: number;
    address?: string;
    idempotencyKey?: string;
  } = {}
): Promise<{
  isReplay: boolean;
  reason?: string;
  cachedResponse?: any;
}> {
  const { requireNonce = false, nonce, address, idempotencyKey } = options;
  
  try {
    // Check idempotency key if provided
    if (idempotencyKey) {
      const cachedResult = store.getIdempotencyResult(idempotencyKey);
      if (cachedResult) {
        await trackEvent('replay_prevented');
        
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
        await trackEvent('replay_prevented');
        
        return {
          isReplay: true,
          reason: `Invalid nonce. Expected: ${store.getNonce(origin, address) + 1}, Provided: ${nonce}`
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
        await trackEvent('replay_prevented');
        
        return {
          isReplay: true,
          reason: 'Identical request made within the last 5 minutes'
        };
      }
    }
    
    return { isReplay: false };
    
  } catch (error) {
    console.error('Error checking replay attempt:', error);
    return { isReplay: false };
  }
}

/**
 * Record a transaction to prevent replay
 */
export function recordTransaction(
  txid: string,
  origin: string,
  method: string,
  params: any[],
  options: {
    idempotencyKey?: string;
    nonce?: string;
    status?: TransactionRecord['status'];
  } = {}
): void {
  const { idempotencyKey, nonce, status = 'pending' } = options;
  
  const record: TransactionRecord = {
    txid,
    timestamp: Date.now(),
    origin,
    method,
    params: JSON.stringify(params),
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
  response: any,
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
  params: any[],
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
  
  // Generate idempotency key if requested
  let idempotencyKey: string | undefined;
  if (generateIdempotencyKey) {
    idempotencyKey = generateIdempotencyKeyInternal(origin, method, params);
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
      return replayCheck.cachedResponse;
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
    await trackEvent('request_failed');
    
    throw error;
  }
}

// Export the store for testing purposes
export const _testStore = store;