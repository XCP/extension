/**
 * ID Generation Utilities
 *
 * Shared utilities for generating unique identifiers throughout the extension.
 */

/**
 * Generate a unique request ID with timestamp and random suffix
 * to prevent collision when multiple requests arrive in the same millisecond.
 *
 * @param prefix - A descriptive prefix for the request type (e.g., 'sign-message', 'connect')
 * @returns A unique ID in the format: `{prefix}-{timestamp}-{random}`
 *
 * @example
 * generateRequestId('sign-message') // 'sign-message-1704067200000-a1b2c3'
 * generateRequestId('connect')       // 'connect-1704067200000-x9y8z7'
 */
export function generateRequestId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}
