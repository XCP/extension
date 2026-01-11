/**
 * Counterparty Message Type Constants
 *
 * These IDs identify the type of Counterparty message encoded in OP_RETURN data.
 * The message type ID is packed after the "CNTRPRTY" prefix.
 */

/** Message type IDs for all Counterparty transaction types */
export const MessageTypeId = {
  SEND: 0,              // Legacy send (send1)
  ENHANCED_SEND: 2,     // Enhanced send with memo support
  MPMA_SEND: 3,         // Multi-party multi-asset send
  SWEEP: 4,             // Sweep all assets to destination
  ORDER: 10,            // DEX order
  BTC_PAY: 11,          // BTC payment for order match
  DISPENSER: 12,        // Create/manage dispenser
  DISPENSE: 13,         // Dispense trigger (usually implicit)
  ISSUANCE: 20,         // Standard asset issuance
  SUBASSET_ISSUANCE: 21, // Subasset issuance
  LR_ISSUANCE: 22,      // Lock/Reset issuance
  LR_SUBASSET: 23,      // Lock/Reset subasset
  BROADCAST: 30,        // Broadcast message
  BET: 40,              // Bet
  DIVIDEND: 50,         // Pay dividend
  CANCEL: 70,           // Cancel order or bet
  FAIRMINTER: 90,       // Create fairminter
  FAIRMINT: 91,         // Mint from fairminter
  UTXO: 100,            // Detach assets from UTXO (move to address)
  UTXO_ATTACH: 101,     // Attach assets to UTXO (move to UTXO)
  DESTROY: 110,         // Destroy assets
} as const;

export type MessageTypeId = typeof MessageTypeId[keyof typeof MessageTypeId];

/** Human-readable names for message types */
export const MessageTypeName: Record<number, string> = {
  [MessageTypeId.SEND]: 'send',
  [MessageTypeId.ENHANCED_SEND]: 'enhanced_send',
  [MessageTypeId.MPMA_SEND]: 'mpma_send',
  [MessageTypeId.SWEEP]: 'sweep',
  [MessageTypeId.ORDER]: 'order',
  [MessageTypeId.BTC_PAY]: 'btcpay',
  [MessageTypeId.DISPENSER]: 'dispenser',
  [MessageTypeId.DISPENSE]: 'dispense',
  [MessageTypeId.ISSUANCE]: 'issuance',
  [MessageTypeId.SUBASSET_ISSUANCE]: 'issuance',
  [MessageTypeId.LR_ISSUANCE]: 'issuance',
  [MessageTypeId.LR_SUBASSET]: 'issuance',
  [MessageTypeId.BROADCAST]: 'broadcast',
  [MessageTypeId.BET]: 'bet',
  [MessageTypeId.DIVIDEND]: 'dividend',
  [MessageTypeId.CANCEL]: 'cancel',
  [MessageTypeId.FAIRMINTER]: 'fairminter',
  [MessageTypeId.FAIRMINT]: 'fairmint',
  [MessageTypeId.UTXO]: 'detach',
  [MessageTypeId.UTXO_ATTACH]: 'attach',
  [MessageTypeId.DESTROY]: 'destroy',
};

/** The "CNTRPRTY" prefix as bytes */
export const COUNTERPARTY_PREFIX = new Uint8Array([0x43, 0x4e, 0x54, 0x52, 0x50, 0x52, 0x54, 0x59]);
export const COUNTERPARTY_PREFIX_HEX = '434e545250525459';

/** Protocol constants */
export const PROTOCOL = {
  /** Unit for asset quantities (10^8, like satoshis) */
  UNIT: 100_000_000n,
  /** Maximum integer value (SQLite3 limit) */
  MAX_INT: 2n ** 63n - 1n,
  /** BTC asset ID */
  BTC_ID: 0n,
  /** XCP asset ID */
  XCP_ID: 1n,
  /** Minimum named asset ID (26^3) */
  MIN_NAMED_ASSET_ID: 26n ** 3n,
  /** Minimum numeric asset ID (26^12 + 1) */
  MIN_NUMERIC_ASSET_ID: 26n ** 12n + 1n,
  /** Maximum asset ID */
  MAX_ASSET_ID: 2n ** 64n - 1n,
} as const;

/** Dispenser status values */
export const DispenserStatus = {
  OPEN: 0,
  OPEN_EMPTY_ADDRESS: 1,
  CLOSED: 10,
  CLOSING: 11,
} as const;
