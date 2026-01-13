/**
 * Shared constants for cross-context messaging between
 * injected script, content script, and background.
 */

/** Message targets for postMessage routing */
export const MESSAGE_TARGETS = {
  /** Messages destined for content script */
  CONTENT: 'xcp-wallet-content',
  /** Messages destined for injected script */
  INJECTED: 'xcp-wallet-injected',
} as const;

/** Message types for XCP wallet communication */
export const MESSAGE_TYPES = {
  /** Request from dApp to wallet */
  REQUEST: 'XCP_WALLET_REQUEST',
  /** Response from wallet to dApp */
  RESPONSE: 'XCP_WALLET_RESPONSE',
  /** Event broadcast from wallet to dApp */
  EVENT: 'XCP_WALLET_EVENT',
} as const;

/** Type helpers */
export type MessageTarget = (typeof MESSAGE_TARGETS)[keyof typeof MESSAGE_TARGETS];
export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];
