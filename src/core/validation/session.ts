/**
 * Session validation utilities
 *
 * Provides validation for session-related operations including
 * wallet IDs, secrets, timeouts, and the number of stored secrets.
 */

// Import from constants.ts to avoid circular dependency with walletManager
import { MAX_WALLETS } from '@/core/wallet/constants';

// Constants for validation and security
export const MAX_WALLET_ID_LENGTH = 128; // SHA-256 produces 64 chars, allow some buffer
export const MAX_SECRET_LENGTH = 1024; // Private keys are ~64 chars, mnemonics ~200 chars max
export const MAX_STORED_SECRETS = MAX_WALLETS; // One secret per wallet (mnemonic or private key)
export const MIN_TIMEOUT_MS = 60000; // 1 minute minimum
export const MAX_TIMEOUT_MS = 86400000; // 24 hours maximum
export const WALLET_ID_REGEX = /^[a-f0-9]{64}$/; // SHA-256 hash format

/**
 * Validates wallet ID format and length
 * @param walletId - The wallet ID to validate
 * @throws Error if wallet ID is invalid
 */
export function validateWalletId(walletId: string): void {
  if (!walletId) {
    throw new Error('Wallet ID is required');
  }
  if (typeof walletId !== 'string') {
    throw new Error('Wallet ID must be a string');
  }
  if (walletId.length > MAX_WALLET_ID_LENGTH) {
    throw new Error(`Wallet ID exceeds maximum length of ${MAX_WALLET_ID_LENGTH}`);
  }
  if (!WALLET_ID_REGEX.test(walletId)) {
    throw new Error('Invalid wallet ID format. Expected SHA-256 hash');
  }
}

/**
 * Validates secret format and length
 * @param secret - The secret to validate
 * @throws Error if secret is invalid
 */
export function validateSecret(secret: string): void {
  if (secret === undefined || secret === null) {
    throw new Error('Secret cannot be null or undefined');
  }
  if (typeof secret !== 'string') {
    throw new Error('Secret must be a string');
  }
  if (secret.length === 0) {
    throw new Error('Secret cannot be empty');
  }
  if (secret.length > MAX_SECRET_LENGTH) {
    throw new Error(`Secret exceeds maximum length of ${MAX_SECRET_LENGTH}`);
  }
}

/**
 * Validates session timeout value
 * @param timeout - The timeout value in milliseconds
 * @throws Error if timeout is invalid
 */
export function validateTimeout(timeout: number): void {
  if (typeof timeout !== 'number' || Number.isNaN(timeout)) {
    throw new Error('Timeout must be a valid number');
  }
  if (timeout < MIN_TIMEOUT_MS) {
    throw new Error(`Timeout must be at least ${MIN_TIMEOUT_MS}ms`);
  }
  if (timeout > MAX_TIMEOUT_MS) {
    throw new Error(`Timeout cannot exceed ${MAX_TIMEOUT_MS}ms`);
  }
}

/**
 * Validates session metadata
 * @param metadata - The session metadata to validate
 * @throws Error if metadata is invalid
 */
export function validateSessionMetadata(metadata: unknown): void {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Invalid session metadata');
  }
  // Type narrowing: after object check, assert shape for property access
  const obj = metadata as Record<string, unknown>;
  if (typeof obj.unlockedAt !== 'number' || obj.unlockedAt <= 0) {
    throw new Error('Invalid unlockedAt timestamp');
  }
  if (typeof obj.lastActiveTime !== 'number' || obj.lastActiveTime <= 0) {
    throw new Error('Invalid lastActiveTime timestamp');
  }
  validateTimeout(obj.timeout as number);
}

/**
 * Asserts that adding a secret would not exceed the limit.
 * @param currentCount - Current number of stored secrets
 * @param walletId - The wallet ID being added
 * @param existingSecrets - Object containing existing secrets
 * @throws Error if adding this secret would exceed the limit
 */
export function assertSecretLimit(
  currentCount: number,
  walletId: string,
  existingSecrets: Record<string, unknown>
): void {
  // If we're updating an existing secret, it doesn't increase the count
  if (walletId in existingSecrets) {
    return;
  }
  
  // Check if adding a new secret would exceed the limit
  if (currentCount >= MAX_STORED_SECRETS) {
    throw new Error(
      `Cannot store more than ${MAX_STORED_SECRETS} wallet secrets. ` +
      `Each wallet stores one secret (mnemonic or private key). ` +
      `Addresses are derived from the wallet secret, not stored separately.`
    );
  }
}

// Unused validation functions - removed
// These could be re-added if session validation is needed in the future