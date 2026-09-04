/**
 * Settings Types
 *
 * Type definitions for application settings.
 * Extracted to avoid circular dependencies between wallet and settings modules.
 */

import type {
  FiatCurrency,
  PriceUnit,
} from '@/core/bitcoin/price';

// Re-export for convenience
export type { FiatCurrency, PriceUnit } from '@/core/bitcoin/price';

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

export const INDEFINITE_ORDER_EXPIRATION = 0;
export const LEGACY_MAX_ORDER_EXPIRATION = 8064;
export const MAX_ORDER_EXPIRATION = 2 ** 16 - 1;
export const DEFAULT_ORDER_EXPIRATION = LEGACY_MAX_ORDER_EXPIRATION;

/** Slippage tolerance sits one notch above fast-chain DEX defaults to absorb pool drift over
 *  Counterparty's ~10-min blocks. 1% is what Auto falls back to with no quote to read, and what
 *  deposit and withdraw use: they are exposed to the pool moving under them just as a swap is —
 *  another deposit, withdrawal or trade confirming first changes what comes back — but neither
 *  quotes a price impact, so there is no per-transaction number to size the tolerance from. */
export const DEFAULT_POOL_SLIPPAGE = '1';

/** The slippage setting's non-numeric value: derive the tolerance per-quote. See getAutoSlippage. */
export const POOL_SLIPPAGE_AUTO = 'auto';

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

  /** Optional provider capabilities, scoped to the connected wallet identity. */
  providerCapabilities?: Record<string, {
    pairedAddresses?: boolean;
    walletId?: string;
    address?: string;
  }>;

  /** Allow unconfirmed transaction inputs */
  allowUnconfirmedTxs: boolean;
  /** Enable multi-peer multi-asset sends */
  enableMPMA: boolean;
  /** Enable attaching BTC to asset sends via more_outputs */
  enableMoreOutputs: boolean;
  /** Enable advanced broadcast options */
  enableAdvancedBroadcasts: boolean;
  /** Dry-run transactions before broadcast */
  transactionDryRun: boolean;
  /** Counterparty API base URL */
  counterpartyApiBase: string;
  /** Alkanes JSON-RPC endpoint used by experimental carrier protection. */
  alkanesApiBase: string;
  /** Attach a DIESEL mint protostone to supported wallet-originated transactions. */
  enableDieselMinting: boolean;
  /** Default order expiration in blocks */
  defaultOrderExpiration: number;
  /**
   * Default pool slippage tolerance: a percent (e.g. "2.5"), or POOL_SLIPPAGE_AUTO to let a swap
   * derive it from that quote's price impact. Falls back to DEFAULT_POOL_SLIPPAGE.
   */
  defaultPoolSlippage?: string;
  /** Block signing if local verification fails */
  strictTransactionVerification: boolean;
  /**
   * Query the Alkanes indexer before selecting or signing inputs, and fail closed when an input's
   * carrier status cannot be proved. This remains useful after experimental minting is disabled.
   */
  protectAlkanesUtxos: boolean;

  /** User has visited recover bitcoin page */
  hasVisitedRecoverBitcoin?: boolean;

  // Hardware Wallet Testing
  /**
   * Enable Trezor emulator mode for development testing.
   * When enabled, Trezor Connect uses direct bridge communication without popup.
   * SECURITY: Never enable in production - bypasses user confirmation UI.
   */
  trezorEmulatorMode?: boolean;
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
  enableMoreOutputs: false,
  enableAdvancedBroadcasts: false,
  transactionDryRun: false,
  counterpartyApiBase: 'https://api.counterparty.io:4000',
  alkanesApiBase: 'https://mainnet.subfrost.io/v4/jsonrpc',
  enableDieselMinting: false,
  defaultOrderExpiration: DEFAULT_ORDER_EXPIRATION,
  defaultPoolSlippage: POOL_SLIPPAGE_AUTO,
  strictTransactionVerification: true,
  protectAlkanesUtxos: false,
  connectedWebsites: [],
  providerCapabilities: {},
  pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
  hasVisitedRecoverBitcoin: false,
};

/**
 * Live read-only settings access for modules that need config (e.g. the API
 * base) without importing the wallet singleton. walletManager registers the
 * provider on init; until then (or when locked) DEFAULT_SETTINGS is returned.
 */
let settingsProvider: (() => AppSettings) | null = null;

export function setSettingsProvider(provider: () => AppSettings): void {
  settingsProvider = provider;
}

/**
 * Note what the fallback means for anything read here while the keychain is locked.
 *
 * Settings live inside the encrypted keychain, so they cannot be read without the key —
 * `walletManager.getSettings()` returns DEFAULT_SETTINGS when no keychain is loaded, and so does
 * this when no provider is registered yet. For the security flags that fails safe:
 * `strictTransactionVerification` defaults to true and `trezorEmulatorMode` to undefined.
 *
 * `counterpartyApiBase` is the exception. It falls back to the public node, so a user who pointed
 * the wallet at their own node has any request issued before unlock go somewhere they did not
 * choose. `IdleTimerWrapper` re-reads settings once the keychain is confirmed loaded, which closes
 * the window after unlock but not before it. Closing it entirely means storing the API base
 * outside the encrypted keychain — a deliberate trade, since it then becomes readable without the
 * password, rather than something to change quietly here.
 */
export function getActiveSettings(): AppSettings {
  return settingsProvider ? settingsProvider() : DEFAULT_SETTINGS;
}

export function getCounterpartyApiBase(): string {
  return getActiveSettings().counterpartyApiBase;
}
