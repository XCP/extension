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
  /**
   * Content script to page: "your request reached me". Sent on receipt, before the wallet
   * answers, so the page can tell a dead bridge (no ack within seconds) from a slow approval
   * (acked, then waiting on the user for as long as it takes).
   */
  ACK: 'XCP_WALLET_ACK',
  /**
   * Page to itself: a marker posted through the same window message queue as the content script's
   * acks, so a late ack timer can check the ack was not merely queued behind a busy page.
   */
  PROBE: 'XCP_WALLET_PROBE',
  /** Event broadcast from wallet to dApp */
  EVENT: 'XCP_WALLET_EVENT',
} as const;
