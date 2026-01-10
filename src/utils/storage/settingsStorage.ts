/**
 * Settings Storage - Encrypted settings persistence layer
 *
 * All settings are encrypted in a single blob using AES-GCM.
 * The encryption key is derived from the user's password and stored
 * in session storage after unlock.
 */

import {
  addRecord,
  updateRecord,
  getRecordById,
  StoredRecord,
} from '@/utils/storage/storage';
import {
  encryptSettings,
  decryptSettings,
  isSettingsKeyAvailable,
  decryptSettingsWithPassword,
  encryptSettingsWithPassword,
  initializeSettingsKey,
} from '@/utils/encryption/settings';
import { TTLCache, CacheTTL } from '@/utils/cache';
import {
  type FiatCurrency,
  type PriceUnit,
  FIAT_CURRENCIES,
  PRICE_UNITS,
} from '@/utils/blockchain/bitcoin/price';

// Re-export for convenience
export type { FiatCurrency, PriceUnit } from '@/utils/blockchain/bitcoin/price';

/**
 * Defines the valid auto-lock timer options in minutes.
 */
export type AutoLockTimer = '1m' | '5m' | '15m' | '30m';

/**
 * Maps auto-lock timer values to milliseconds.
 */
const AUTO_LOCK_TIMEOUT_MS: Record<AutoLockTimer, number> = {
  '1m': 1 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
};

/**
 * Valid auto-lock timer values for validation.
 */
const VALID_AUTO_LOCK_TIMERS: AutoLockTimer[] = ['1m', '5m', '15m', '30m'];

/**
 * User display preferences.
 * These are passive settings that affect how data is displayed,
 * rather than app behavior or connections.
 */
export interface DisplayPreferences {
  /** Preferred fiat currency for price display */
  fiat: FiatCurrency;
  /** Price display unit (BTC, sats, or fiat) */
  unit: PriceUnit;
}

/**
 * Current settings schema version.
 * Increment this when making breaking changes to the settings structure.
 */
export const SETTINGS_VERSION = 1;

/**
 * Unified settings interface - ALL settings are encrypted together.
 */
export interface AppSettings {
  // Schema version for migrations
  version?: number;

  // Wallet state
  lastActiveWalletId?: string;
  lastActiveAddress?: string;

  // Auto-lock
  autoLockTimeout: number; // in milliseconds
  autoLockTimer: AutoLockTimer;

  // Feature flags
  showHelpText: boolean;
  analyticsAllowed: boolean;
  allowUnconfirmedTxs: boolean;
  enableMPMA: boolean;
  enableAdvancedBroadcasts: boolean;
  transactionDryRun: boolean;

  // API settings
  counterpartyApiBase: string;
  defaultOrderExpiration: number; // in blocks (default: 8064 = ~8 weeks)

  // Connection state
  connectedWebsites: string[];

  // User data
  pinnedAssets: string[];
  hasVisitedRecoverBitcoin?: boolean;

  // Display preferences (passive settings for how data is shown)
  preferences: DisplayPreferences;
}

/**
 * Default display preferences.
 */
export const DEFAULT_PREFERENCES: DisplayPreferences = {
  fiat: 'usd',
  unit: 'btc',
};

/**
 * Default settings returned when wallet is locked or no settings exist.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  lastActiveWalletId: undefined,
  lastActiveAddress: undefined,
  autoLockTimeout: 5 * 60 * 1000, // 5 minutes default
  autoLockTimer: '5m',
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: true,
  enableMPMA: false,
  enableAdvancedBroadcasts: false,
  transactionDryRun: process.env.NODE_ENV === 'development',
  counterpartyApiBase: 'https://api.counterparty.io:4000',
  defaultOrderExpiration: 8064, // ~8 weeks (56 days) at 10min/block
  connectedWebsites: [],
  pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
  hasVisitedRecoverBitcoin: false,
  preferences: { ...DEFAULT_PREFERENCES },
};

/**
 * Storage record with single encrypted blob.
 */
interface SettingsRecord extends StoredRecord {
  encryptedSettings?: string;
}

/**
 * Unique ID for the settings record in storage.
 */
const SETTINGS_RECORD_ID = 'keychain-settings';

/**
 * Settings cache with TTL to avoid redundant storage reads.
 * During a transaction flow (compose → sign → broadcast), multiple
 * functions call getSettings(). This cache prevents repeated storage
 * reads per transaction while keeping data fresh within 5 seconds.
 */
const settingsCache = new TTLCache<AppSettings>(CacheTTL.SHORT, cloneSettings);

/** Deep clone settings to prevent mutation of cached data */
function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    connectedWebsites: [...settings.connectedWebsites],
    pinnedAssets: [...settings.pinnedAssets],
    preferences: { ...settings.preferences },
  };
}

/**
 * Invalidates the settings cache.
 * Called when settings are saved to ensure fresh data.
 */
export function invalidateSettingsCache(): void {
  settingsCache.invalidate();
}

/**
 * Returns a deep copy of default settings.
 * This prevents shared array references between different callers.
 */
function getDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    connectedWebsites: [...DEFAULT_SETTINGS.connectedWebsites],
    pinnedAssets: [...DEFAULT_SETTINGS.pinnedAssets],
    preferences: { ...DEFAULT_PREFERENCES },
  };
}

/**
 * Loads settings from storage with caching.
 * Returns decrypted settings if wallet is unlocked, defaults if locked.
 * Uses a 5-second TTL cache to avoid redundant storage reads during
 * transaction flows (compose → sign → broadcast).
 */
export async function getSettings(): Promise<AppSettings> {
  // Check cache first (TTLCache.get() returns cloned data or null)
  const cached = settingsCache.get();
  if (cached !== null) {
    return cached;
  }

  const record = await getRecordById(SETTINGS_RECORD_ID) as SettingsRecord | undefined;

  // No record exists - return defaults (don't cache defaults)
  if (!record || !record.encryptedSettings) {
    return getDefaultSettings();
  }

  // Check if we have the decryption key
  const keyAvailable = await isSettingsKeyAvailable();
  if (!keyAvailable) {
    // Locked - return defaults (don't cache when locked)
    return getDefaultSettings();
  }

  try {
    const settings = await decryptSettings(record.encryptedSettings);
    const normalized = normalizeSettings(settings);

    // Update cache
    settingsCache.set(normalized);

    // Return a cloned copy
    return cloneSettings(normalized);
  } catch (err) {
    console.warn('Failed to decrypt settings, using defaults:', err);
    return getDefaultSettings();
  }
}

/**
 * Normalizes and validates settings, providing safe defaults for corrupted data.
 * This is critical for preventing crashes from malformed storage data.
 */
function normalizeSettings(settings: AppSettings): AppSettings {
  const normalized = { ...settings };

  // Validate autoLockTimer
  if (!VALID_AUTO_LOCK_TIMERS.includes(normalized.autoLockTimer)) {
    normalized.autoLockTimer = DEFAULT_SETTINGS.autoLockTimer;
  }

  // Ensure autoLockTimeout matches autoLockTimer
  normalized.autoLockTimeout = AUTO_LOCK_TIMEOUT_MS[normalized.autoLockTimer];

  // Validate arrays - must be arrays of strings
  if (!Array.isArray(normalized.connectedWebsites)) {
    normalized.connectedWebsites = [];
  } else {
    // Filter out non-string entries
    normalized.connectedWebsites = normalized.connectedWebsites.filter(
      (site): site is string => typeof site === 'string' && site.length > 0
    );
  }

  if (!Array.isArray(normalized.pinnedAssets)) {
    normalized.pinnedAssets = [...DEFAULT_SETTINGS.pinnedAssets];
  } else {
    // Filter out non-string entries
    normalized.pinnedAssets = normalized.pinnedAssets.filter(
      (asset): asset is string => typeof asset === 'string' && asset.length > 0
    );
  }

  // Validate counterpartyApiBase - must be valid URL
  if (typeof normalized.counterpartyApiBase !== 'string' || !isValidApiUrl(normalized.counterpartyApiBase)) {
    normalized.counterpartyApiBase = DEFAULT_SETTINGS.counterpartyApiBase;
  }

  // Validate defaultOrderExpiration - must be positive number
  if (typeof normalized.defaultOrderExpiration !== 'number' ||
      !Number.isFinite(normalized.defaultOrderExpiration) ||
      normalized.defaultOrderExpiration <= 0) {
    normalized.defaultOrderExpiration = DEFAULT_SETTINGS.defaultOrderExpiration;
  }

  // Validate boolean flags - coerce to boolean with defaults
  normalized.showHelpText = Boolean(normalized.showHelpText);
  normalized.analyticsAllowed = normalized.analyticsAllowed !== false; // default true
  normalized.allowUnconfirmedTxs = normalized.allowUnconfirmedTxs !== false; // default true
  normalized.enableMPMA = Boolean(normalized.enableMPMA);
  normalized.enableAdvancedBroadcasts = Boolean(normalized.enableAdvancedBroadcasts);
  normalized.transactionDryRun = Boolean(normalized.transactionDryRun);
  normalized.hasVisitedRecoverBitcoin = Boolean(normalized.hasVisitedRecoverBitcoin);

  // Validate preferences object
  if (!normalized.preferences || typeof normalized.preferences !== 'object') {
    normalized.preferences = { ...DEFAULT_PREFERENCES };
  } else {
    // Validate preferences.unit
    if (!PRICE_UNITS.includes(normalized.preferences.unit)) {
      normalized.preferences.unit = DEFAULT_PREFERENCES.unit;
    }

    // Validate preferences.fiat
    if (!FIAT_CURRENCIES.includes(normalized.preferences.fiat)) {
      normalized.preferences.fiat = DEFAULT_PREFERENCES.fiat;
    }
  }

  // Validate optional string fields
  if (normalized.lastActiveWalletId !== undefined && typeof normalized.lastActiveWalletId !== 'string') {
    normalized.lastActiveWalletId = undefined;
  }
  if (normalized.lastActiveAddress !== undefined && typeof normalized.lastActiveAddress !== 'string') {
    normalized.lastActiveAddress = undefined;
  }

  // Validate version
  if (normalized.version !== undefined && typeof normalized.version !== 'number') {
    normalized.version = SETTINGS_VERSION;
  }

  return normalized;
}

/**
 * Validates that a string is a valid API URL (https only, valid format)
 */
function isValidApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Updates settings by merging new values with current.
 * Requires wallet to be unlocked.
 *
 * For nested objects like `preferences`, pass a partial object to merge:
 * updateSettings({ preferences: { fiat: 'jpy' } }) // Only updates fiat, keeps unit
 */
export async function updateSettings(
  newSettings: Omit<Partial<AppSettings>, 'preferences'> & { preferences?: Partial<DisplayPreferences> }
): Promise<void> {
  const keyAvailable = await isSettingsKeyAvailable();
  if (!keyAvailable) {
    throw new Error('Cannot update settings when wallet is locked');
  }

  // Invalidate cache FIRST to prevent stale reads during concurrent operations
  // This ensures getSettings() below fetches fresh data from storage
  invalidateSettingsCache();

  // Get current settings (will be decrypted since key is available)
  const current = await getSettings();

  // Merge top-level settings, keeping current preferences initially
  const { preferences: newPreferences, ...restSettings } = newSettings;
  const updated: AppSettings = {
    ...current,
    ...restSettings,
    // Deep merge preferences if provided, otherwise keep current
    preferences: newPreferences
      ? { ...current.preferences, ...newPreferences }
      : current.preferences,
  };

  // Handle autoLockTimer → autoLockTimeout sync
  if (newSettings.autoLockTimer) {
    updated.autoLockTimeout = AUTO_LOCK_TIMEOUT_MS[newSettings.autoLockTimer];
  }

  // Encrypt and save
  const encrypted = await encryptSettings(updated);
  const record: SettingsRecord = {
    id: SETTINGS_RECORD_ID,
    encryptedSettings: encrypted,
  };

  const existing = await getRecordById(SETTINGS_RECORD_ID);
  if (existing) {
    await updateRecord(record);
  } else {
    await addRecord(record);
  }

  // Invalidate cache to ensure fresh data on next read
  invalidateSettingsCache();
}

/**
 * Re-encrypts settings with a new password.
 * Called during password change.
 */
export async function reencryptSettings(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const record = await getRecordById(SETTINGS_RECORD_ID) as SettingsRecord | undefined;

  if (!record || !record.encryptedSettings) {
    // No settings to re-encrypt
    return;
  }

  // Decrypt with old password
  const settings = await decryptSettingsWithPassword(record.encryptedSettings, oldPassword);

  // Re-encrypt with new password
  const newEncrypted = await encryptSettingsWithPassword(settings, newPassword);

  // Save
  const newRecord: SettingsRecord = {
    id: SETTINGS_RECORD_ID,
    encryptedSettings: newEncrypted,
  };
  await updateRecord(newRecord);

  // Update session key with new password
  await initializeSettingsKey(newPassword);

  // Invalidate cache to ensure fresh data
  invalidateSettingsCache();
}
