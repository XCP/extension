/**
 * Settings Types
 *
 * Type definitions for application settings.
 * Extracted to avoid circular dependencies between wallet and settings modules.
 */

import type {
  FiatCurrency,
  PriceUnit,
} from '@/utils/blockchain/bitcoin/price';

// Re-export for convenience
export type { FiatCurrency, PriceUnit } from '@/utils/blockchain/bitcoin/price';

/**
 * Valid auto-lock timer options.
 */
export type AutoLockTimer = '1m' | '5m' | '15m' | '30m';

/**
 * Maps auto-lock timer values to milliseconds.
 */
export const AUTO_LOCK_TIMEOUT_MS: Record<AutoLockTimer, number> = {
  '1m': 1 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
};

/**
 * Valid auto-lock timer values for validation.
 */
export const VALID_AUTO_LOCK_TIMERS: AutoLockTimer[] = ['1m', '5m', '15m', '30m'];

/**
 * Converts an AutoLockTimer value to milliseconds.
 */
export function getAutoLockTimeoutMs(timer: AutoLockTimer): number {
  return AUTO_LOCK_TIMEOUT_MS[timer];
}

/**
 * Current settings schema version.
 */
export const SETTINGS_VERSION = 2;

/**
 * Application settings - stored encrypted inside the keychain.
 */
export interface AppSettings {
  /** Schema version for migrations */
  version?: number;

  /** Last active wallet ID (auto-load on unlock) */
  lastActiveWalletId?: string;
  /** Last active address (restored on unlock) */
  lastActiveAddress?: string;

  /** Auto-lock timer duration */
  autoLockTimer: AutoLockTimer;

  /** Fiat currency for price display */
  fiat: FiatCurrency;
  /** Price unit (btc or sats) */
  priceUnit: PriceUnit;

  /** Pinned assets shown at top of list */
  pinnedAssets: string[];
  /** Show help text in UI */
  showHelpText: boolean;
  /** Allow anonymous analytics */
  analyticsAllowed: boolean;

  /** Connected dApp websites */
  connectedWebsites: string[];

  /** Allow unconfirmed transaction inputs */
  allowUnconfirmedTxs: boolean;
  /** Enable multi-peer multi-asset sends */
  enableMPMA: boolean;
  /** Enable advanced broadcast options */
  enableAdvancedBroadcasts: boolean;
  /** Dry-run transactions before broadcast */
  transactionDryRun: boolean;
  /** Counterparty API base URL */
  counterpartyApiBase: string;
  /** Default order expiration in blocks */
  defaultOrderExpiration: number;
  /** Block signing if local verification fails */
  strictTransactionVerification: boolean;

  /** User has visited recover bitcoin page */
  hasVisitedRecoverBitcoin?: boolean;
}

/**
 * Default settings for new keychains.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  lastActiveWalletId: undefined,
  lastActiveAddress: undefined,
  autoLockTimer: '5m',
  fiat: 'usd',
  priceUnit: 'btc',
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: true,
  enableMPMA: false,
  enableAdvancedBroadcasts: false,
  transactionDryRun: false,
  counterpartyApiBase: 'https://api.counterparty.io:4000',
  defaultOrderExpiration: 8064,
  strictTransactionVerification: true,
  connectedWebsites: [],
  pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
  hasVisitedRecoverBitcoin: false,
};
