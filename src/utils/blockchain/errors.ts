/**
 * Blockchain Error Types
 *
 * Structured error hierarchy for blockchain operations.
 * Enables consistent error handling and user-friendly messaging.
 */

/**
 * Error codes for blockchain operations.
 * Used for programmatic error handling.
 */
export type BlockchainErrorCode =
  // Network errors
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'API_UNAVAILABLE'
  // Validation errors
  | 'INVALID_ADDRESS'
  | 'INVALID_PRIVATE_KEY'
  | 'INVALID_TRANSACTION'
  | 'INVALID_SIGNATURE'
  // State errors
  | 'NO_UTXOS'
  | 'INSUFFICIENT_FUNDS'
  | 'UTXO_NOT_FOUND'
  | 'WALLET_LOCKED'
  // Transaction errors
  | 'SIGNING_FAILED'
  | 'BROADCAST_FAILED'
  | 'COMPOSE_FAILED'
  // General
  | 'UNKNOWN';

/**
 * Base error class for all blockchain-related errors.
 * Provides structured error information for handling and display.
 */
export class BlockchainError extends Error {
  readonly code: BlockchainErrorCode;
  readonly userMessage: string;
  readonly cause?: Error;

  constructor(
    code: BlockchainErrorCode,
    message: string,
    options?: {
      userMessage?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
    this.userMessage = options?.userMessage ?? message;
    this.cause = options?.cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BlockchainError);
    }
  }
}

/**
 * Validation errors (invalid addresses, keys, etc.)
 */
export class ValidationError extends BlockchainError {
  constructor(
    code: Extract<BlockchainErrorCode, 'INVALID_ADDRESS' | 'INVALID_PRIVATE_KEY' | 'INVALID_TRANSACTION' | 'INVALID_SIGNATURE'>,
    message: string,
    options?: { userMessage?: string; cause?: Error }
  ) {
    super(code, message, options);
    this.name = 'ValidationError';
  }
}

/**
 * UTXO-related errors
 */
export class UtxoError extends BlockchainError {
  readonly address?: string;
  readonly txid?: string;

  constructor(
    code: Extract<BlockchainErrorCode, 'NO_UTXOS' | 'UTXO_NOT_FOUND'>,
    message: string,
    options?: { address?: string; txid?: string; userMessage?: string }
  ) {
    super(code, message, {
      userMessage: options?.userMessage ?? 'Unable to find transaction outputs. Please try again.',
    });
    this.name = 'UtxoError';
    this.address = options?.address;
    this.txid = options?.txid;
  }
}

/**
 * Transaction signing errors
 */
export class SigningError extends BlockchainError {
  constructor(message: string, options?: { userMessage?: string; cause?: Error }) {
    super('SIGNING_FAILED', message, {
      userMessage: options?.userMessage ?? 'Failed to sign transaction. Please try again.',
      cause: options?.cause,
    });
    this.name = 'SigningError';
  }
}

/**
 * Type guard to check if an error is a BlockchainError
 */
export function isBlockchainError(error: unknown): error is BlockchainError {
  return error instanceof BlockchainError;
}

/**
 * Sanitizes API error messages for user display.
 * Truncates long messages and provides fallback for overly technical errors.
 */
function sanitizeApiMessage(message: string): string {
  // Truncate very long messages
  const maxLength = 200;
  if (message.length > maxLength) {
    return message.substring(0, maxLength) + '...';
  }

  // Check for overly technical patterns that shouldn't be shown to users
  const technicalPatterns = [
    /internal server error/i,
    /stack trace/i,
    /exception/i,
    /traceback/i,
    /^\s*at\s+/m, // Stack trace lines
  ];

  for (const pattern of technicalPatterns) {
    if (pattern.test(message)) {
      return 'The API encountered an error. Please try again later.';
    }
  }

  return message;
}

/**
 * Generic data fetch error for any external API or data source.
 * Use this for errors from Bitcoin explorers, price feeds, and other external sources.
 */
export class DataFetchError extends BlockchainError {
  readonly source: string;
  readonly endpoint?: string;
  readonly statusCode?: number;

  constructor(
    message: string,
    source: string,
    options?: { endpoint?: string; statusCode?: number; userMessage?: string; cause?: Error }
  ) {
    super('NETWORK_ERROR', message, {
      userMessage: options?.userMessage ?? `Failed to fetch data from ${source}. Please try again.`,
      cause: options?.cause,
    });
    this.name = 'DataFetchError';
    this.source = source;
    this.endpoint = options?.endpoint;
    this.statusCode = options?.statusCode;
  }
}

/**
 * Type guard to check if an error is a DataFetchError
 */
export function isDataFetchError(error: unknown): error is DataFetchError {
  return error instanceof DataFetchError;
}

/**
 * Counterparty API errors - sanitizes API error messages for user display
 */
export class CounterpartyApiError extends BlockchainError {
  readonly endpoint: string;
  readonly statusCode?: number;

  constructor(
    message: string,
    endpoint: string,
    options?: { statusCode?: number; cause?: Error }
  ) {
    super('API_UNAVAILABLE', message, {
      userMessage: sanitizeApiMessage(message),
      cause: options?.cause,
    });
    this.name = 'CounterpartyApiError';
    this.endpoint = endpoint;
    this.statusCode = options?.statusCode;
  }
}
