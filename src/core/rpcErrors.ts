/**
 * Standard JSON-RPC 2.0 and Web3 Error Codes
 * 
 * This file contains standardized error codes used throughout the extension
 * for consistent error handling with dApps and Web3 applications.
 */

/**
 * Standard JSON-RPC 2.0 error codes
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const JSON_RPC_ERROR_CODES = {
  /**
   * Invalid JSON was received by the server.
   * An error occurred on the server while parsing the JSON text.
   */
  PARSE_ERROR: -32700,

  /**
   * The JSON sent is not a valid Request object.
   */
  INVALID_REQUEST: -32600,

  /**
   * The method does not exist / is not available.
   */
  METHOD_NOT_FOUND: -32601,

  /**
   * Invalid method parameter(s).
   */
  INVALID_PARAMS: -32602,

  /**
   * Internal JSON-RPC error.
   * Generic error when something goes wrong internally.
   */
  INTERNAL_ERROR: -32603,

  /**
   * Reserved for implementation-defined server-errors.
   * -32000 to -32099
   */
  SERVER_ERROR: -32000,
} as const;

/**
 * Ethereum Provider Error Codes (EIP-1193, EIP-1474)
 * @see https://eips.ethereum.org/EIPS/eip-1193
 * @see https://eips.ethereum.org/EIPS/eip-1474
 */
export const PROVIDER_ERROR_CODES = {
  /**
   * User rejected the request.
   * E.g., user denied transaction signature, account access, etc.
   */
  USER_REJECTED: 4001,

  /**
   * The requested method and/or account has not been authorized by the user.
   */
  UNAUTHORIZED: 4100,

  /**
   * The Provider does not support the requested method.
   */
  UNSUPPORTED_METHOD: 4200,

  /**
   * The Provider is disconnected from all chains.
   */
  DISCONNECTED: 4900,

  /**
   * The Provider is not connected to the requested chain.
   */
  CHAIN_DISCONNECTED: 4901,

  /**
   * The requested chains have not been added to the provider.
   */
  CHAINS_NOT_ADDED: 4902,
} as const;

/**
 * Custom XCP Wallet Error Codes
 * Application-specific error codes for the XCP Wallet extension
 */
// TODO: Update error handling to use these constants instead of string literals
// Currently unused but should be used for consistent error codes
// export const XCP_ERROR_CODES = {
//   /**
//    * Wallet is locked and requires unlocking
//    */
//   WALLET_LOCKED: -32001,
//
//   /**
//    * No wallet exists, user needs to create or import one
//    */
//   NO_WALLET: -32002,
//
//   /**
//    * Transaction creation or composition failed
//    */
//   TRANSACTION_FAILED: -32003,
//
//   /**
//    * Insufficient balance for the requested operation
//    */
//   INSUFFICIENT_BALANCE: -32004,
//
//   /**
//    * Rate limit exceeded for the origin
//    */
//   RATE_LIMITED: -32005,
//
//   /**
//    * Invalid address format or checksum
//    */
//   INVALID_ADDRESS: -32006,
//
//   /**
//    * Asset not found or invalid
//    */
//   ASSET_NOT_FOUND: -32007,
//
//   /**
//    * Network error when communicating with blockchain APIs
//    */
//   NETWORK_ERROR: -32008,
//
//   /**
//    * Origin/domain is not connected to the wallet
//    */
//   NOT_CONNECTED: -32009,
//
//   /**
//    * Operation timed out
//    */
//   TIMEOUT: -32010,
// } as const;

/**
 * Error carrying a JSON-RPC / EIP-1193 code. Throwing this at a provider boundary
 * is the author's signal that the message is dApp-safe and should be surfaced with
 * the given code — no string matching required downstream.
 */
export class ProviderError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/**
 * Map a thrown provider error to the code and message a dApp should receive.
 * User-facing states (rejection, not-connected/locked/setup) are surfaced with a
 * structured code so dApps can branch; everything else is masked to a generic
 * message so internals don't leak. Used at every dApp-facing boundary so the
 * classification can't drift out of sync with the messages the wallet throws.
 */
/**
 * Codes whose accompanying message is safe to surface to a dApp. A carried code
 * outside this set (an internal error, or an accidental numeric `.code` on an
 * unexpected throw) is masked so internals never leak.
 */
const SURFACEABLE_CODES: ReadonlySet<number> = new Set([
  PROVIDER_ERROR_CODES.USER_REJECTED,
  PROVIDER_ERROR_CODES.UNAUTHORIZED,
  PROVIDER_ERROR_CODES.UNSUPPORTED_METHOD,
  PROVIDER_ERROR_CODES.DISCONNECTED,
  PROVIDER_ERROR_CODES.CHAIN_DISCONNECTED,
  PROVIDER_ERROR_CODES.CHAINS_NOT_ADDED,
  JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
  JSON_RPC_ERROR_CODES.INVALID_PARAMS,
]);

export function classifyProviderError(error: unknown): { code: number; message: string } {
  // A recognized code carried from the throw site (a ProviderError) means the
  // message is intentional and dApp-safe — surface both. Anything else is masked
  // so internals never leak. dApp-facing errors must be thrown as ProviderError.
  const carried = (error as { code?: unknown })?.code;
  if (typeof carried === 'number' && SURFACEABLE_CODES.has(carried)) {
    return { code: carried, message: error instanceof Error ? error.message : String(error) };
  }
  return { code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR, message: 'Request failed' };
}

/**
 * Helper function to create a JSON-RPC error object
 */
export function createJsonRpcError(
  code: number,
  message: string,
  data?: unknown
): {
  code: number;
  message: string;
  data?: unknown;
} {
  const error: any = {
    code,
    message,
  };
  
  if (data !== undefined) {
    error.data = data;
  }
  
  return error;
}

