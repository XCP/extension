import {
  getAllRecords,
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
} from '@/utils/encryption/settingsEncryption';

/**
 * Defines the valid auto-lock timer options in minutes.
 */
export type AutoLockTimer = '1m' | '5m' | '15m' | '30m';

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
  enableAdvancedBetting: boolean;
  transactionDryRun: boolean;

  // API settings
  counterpartyApiBase: string;
  defaultOrderExpiration: number; // in blocks (default: 8064 = ~8 weeks)

  // Connection state
  connectedWebsites: string[];

  // User preferences
  pinnedAssets: string[];
  hasVisitedRecoverBitcoin?: boolean;
}

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
  enableAdvancedBetting: false,
  transactionDryRun: process.env.NODE_ENV === 'development',
  counterpartyApiBase: 'https://api.counterparty.io:4000',
  defaultOrderExpiration: 8064, // ~8 weeks (56 days) at 10min/block
  connectedWebsites: [],
  pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
  hasVisitedRecoverBitcoin: false,
};

/**
 * Storage record with single encrypted blob.
 */
interface SettingsRecord extends StoredRecord {
  encryptedSettings?: string;
  // Legacy fields for migration detection
  autoLockTimeout?: number;
  encryptedSensitiveData?: string;
  lastActiveAddress?: string;
  connectedWebsites?: string[];
  pinnedAssets?: string[];
}

/**
 * Unique ID for the settings record in storage.
 */
const SETTINGS_RECORD_ID = 'keychain-settings';

// Re-export for backward compatibility
export type KeychainSettings = AppSettings;
export const DEFAULT_KEYCHAIN_SETTINGS = DEFAULT_SETTINGS;

/**
 * Returns a deep copy of default settings.
 * This prevents shared array references between different callers.
 */
function getDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    connectedWebsites: [...DEFAULT_SETTINGS.connectedWebsites],
    pinnedAssets: [...DEFAULT_SETTINGS.pinnedAssets],
  };
}

/**
 * Loads settings from storage.
 * Returns decrypted settings if wallet is unlocked, defaults if locked.
 */
export async function getKeychainSettings(): Promise<AppSettings> {
  const record = await getRecordById(SETTINGS_RECORD_ID) as SettingsRecord | undefined;

  // No record exists - return defaults
  if (!record) {
    return getDefaultSettings();
  }

  // Check if we have the decryption key
  const keyAvailable = await isSettingsKeyAvailable();

  // New format: single encrypted blob
  if (record.encryptedSettings) {
    if (!keyAvailable) {
      // Locked - return defaults
      return getDefaultSettings();
    }

    try {
      const settings = await decryptSettings(record.encryptedSettings);
      return normalizeSettings(settings);
    } catch (err) {
      console.warn('Failed to decrypt settings, using defaults:', err);
      return getDefaultSettings();
    }
  }

  // Legacy format: check if migration is needed
  if (isLegacyFormat(record)) {
    if (keyAvailable) {
      // Migrate and return decrypted settings
      const migrated = await migrateLegacySettings(record);
      return normalizeSettings(migrated);
    } else {
      // Can't migrate yet - return defaults
      return getDefaultSettings();
    }
  }

  // Empty record - return defaults
  return getDefaultSettings();
}

/**
 * Checks if a record is in the legacy format (needs migration).
 */
function isLegacyFormat(record: SettingsRecord): boolean {
  // Legacy format has either:
  // 1. Public fields stored directly (autoLockTimeout, etc.)
  // 2. encryptedSensitiveData for sensitive fields
  // 3. Unencrypted sensitive fields (very old format)
  return (
    record.autoLockTimeout !== undefined ||
    record.encryptedSensitiveData !== undefined ||
    record.lastActiveAddress !== undefined ||
    record.connectedWebsites !== undefined ||
    record.pinnedAssets !== undefined
  );
}

/**
 * Migrates legacy settings format to new encrypted format.
 * Called when we have the encryption key available.
 */
async function migrateLegacySettings(record: SettingsRecord): Promise<AppSettings> {
  const {
    decryptSensitiveSettings,
  } = await import('@/utils/encryption/sensitiveSettings');

  // Infer autoLockTimer from autoLockTimeout if timer not present
  let inferredTimer: AutoLockTimer = (record as any).autoLockTimer ?? DEFAULT_SETTINGS.autoLockTimer;
  if (!(record as any).autoLockTimer && record.autoLockTimeout !== undefined) {
    const minutes = record.autoLockTimeout / (60 * 1000);
    if (minutes === 1) inferredTimer = '1m';
    else if (minutes === 5) inferredTimer = '5m';
    else if (minutes === 15) inferredTimer = '15m';
    else if (minutes === 30) inferredTimer = '30m';
    // Otherwise keep default '5m'
  }

  // Build settings from legacy record
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    version: SETTINGS_VERSION, // Mark as current version after migration
    // Public fields from old format
    lastActiveWalletId: (record as any).lastActiveWalletId ?? DEFAULT_SETTINGS.lastActiveWalletId,
    autoLockTimeout: record.autoLockTimeout ?? DEFAULT_SETTINGS.autoLockTimeout,
    showHelpText: (record as any).showHelpText ?? DEFAULT_SETTINGS.showHelpText,
    analyticsAllowed: (record as any).analyticsAllowed ?? DEFAULT_SETTINGS.analyticsAllowed,
    allowUnconfirmedTxs: (record as any).allowUnconfirmedTxs ?? DEFAULT_SETTINGS.allowUnconfirmedTxs,
    autoLockTimer: inferredTimer,
    enableMPMA: (record as any).enableMPMA ?? DEFAULT_SETTINGS.enableMPMA,
    enableAdvancedBroadcasts: (record as any).enableAdvancedBroadcasts ?? DEFAULT_SETTINGS.enableAdvancedBroadcasts,
    enableAdvancedBetting: (record as any).enableAdvancedBetting ?? DEFAULT_SETTINGS.enableAdvancedBetting,
    transactionDryRun: (record as any).transactionDryRun ?? DEFAULT_SETTINGS.transactionDryRun,
    counterpartyApiBase: (record as any).counterpartyApiBase ?? DEFAULT_SETTINGS.counterpartyApiBase,
    defaultOrderExpiration: (record as any).defaultOrderExpiration ?? DEFAULT_SETTINGS.defaultOrderExpiration,
    hasVisitedRecoverBitcoin: (record as any).hasVisitedRecoverBitcoin ?? DEFAULT_SETTINGS.hasVisitedRecoverBitcoin,
  };

  // Try to get sensitive fields from encrypted data
  if (record.encryptedSensitiveData) {
    try {
      const sensitive = await decryptSensitiveSettings(record.encryptedSensitiveData);
      settings.lastActiveAddress = sensitive.lastActiveAddress;
      settings.connectedWebsites = sensitive.connectedWebsites;
      settings.pinnedAssets = sensitive.pinnedAssets;
    } catch (err) {
      console.warn('Failed to decrypt legacy sensitive settings:', err);
    }
  } else {
    // Very old format: unencrypted sensitive fields
    if (record.lastActiveAddress !== undefined) {
      settings.lastActiveAddress = record.lastActiveAddress;
    }
    if (record.connectedWebsites !== undefined) {
      settings.connectedWebsites = record.connectedWebsites;
    }
    if (record.pinnedAssets !== undefined) {
      settings.pinnedAssets = record.pinnedAssets;
    }
  }

  // Save in new format
  const encrypted = await encryptSettings(settings);
  const newRecord: SettingsRecord = {
    id: SETTINGS_RECORD_ID,
    encryptedSettings: encrypted,
  };
  await updateRecord(newRecord);

  console.log('Migrated settings to new encrypted format');
  return settings;
}

/**
 * Normalizes settings by ensuring autoLockTimer and autoLockTimeout are consistent.
 */
function normalizeSettings(settings: AppSettings): AppSettings {
  const normalized = { ...settings };

  // Validate autoLockTimer
  if (!['1m', '5m', '15m', '30m'].includes(normalized.autoLockTimer)) {
    normalized.autoLockTimer = '5m';
  }

  // Ensure autoLockTimeout matches autoLockTimer
  const expectedTimeout = {
    '1m': 1 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
  }[normalized.autoLockTimer];

  normalized.autoLockTimeout = expectedTimeout;

  return normalized;
}

/**
 * Updates settings by merging new values with current.
 * Requires wallet to be unlocked.
 */
export async function updateKeychainSettings(
  newSettings: Partial<AppSettings>
): Promise<void> {
  const keyAvailable = await isSettingsKeyAvailable();
  if (!keyAvailable) {
    throw new Error('Cannot update settings when wallet is locked');
  }

  // Get current settings (will be decrypted since key is available)
  const current = await getKeychainSettings();
  let updated: AppSettings = { ...current, ...newSettings };

  // Handle autoLockTimer → autoLockTimeout sync
  if (newSettings.autoLockTimer) {
    const timeoutMap: Record<AutoLockTimer, number> = {
      '1m': 1 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
    };
    updated.autoLockTimeout = timeoutMap[newSettings.autoLockTimer];
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

  if (!record) {
    // No settings to re-encrypt
    return;
  }

  let settings: AppSettings;

  if (record.encryptedSettings) {
    // New format - decrypt with old password
    settings = await decryptSettingsWithPassword(record.encryptedSettings, oldPassword);
  } else if (isLegacyFormat(record)) {
    // Legacy format - need to build settings and decrypt sensitive part
    const {
      decryptSensitiveSettingsWithPassword,
    } = await import('@/utils/encryption/sensitiveSettings');

    settings = {
      ...DEFAULT_SETTINGS,
      lastActiveWalletId: (record as any).lastActiveWalletId ?? DEFAULT_SETTINGS.lastActiveWalletId,
      autoLockTimeout: record.autoLockTimeout ?? DEFAULT_SETTINGS.autoLockTimeout,
      showHelpText: (record as any).showHelpText ?? DEFAULT_SETTINGS.showHelpText,
      analyticsAllowed: (record as any).analyticsAllowed ?? DEFAULT_SETTINGS.analyticsAllowed,
      allowUnconfirmedTxs: (record as any).allowUnconfirmedTxs ?? DEFAULT_SETTINGS.allowUnconfirmedTxs,
      autoLockTimer: (record as any).autoLockTimer ?? DEFAULT_SETTINGS.autoLockTimer,
      enableMPMA: (record as any).enableMPMA ?? DEFAULT_SETTINGS.enableMPMA,
      enableAdvancedBroadcasts: (record as any).enableAdvancedBroadcasts ?? DEFAULT_SETTINGS.enableAdvancedBroadcasts,
      enableAdvancedBetting: (record as any).enableAdvancedBetting ?? DEFAULT_SETTINGS.enableAdvancedBetting,
      transactionDryRun: (record as any).transactionDryRun ?? DEFAULT_SETTINGS.transactionDryRun,
      counterpartyApiBase: (record as any).counterpartyApiBase ?? DEFAULT_SETTINGS.counterpartyApiBase,
      defaultOrderExpiration: (record as any).defaultOrderExpiration ?? DEFAULT_SETTINGS.defaultOrderExpiration,
      hasVisitedRecoverBitcoin: (record as any).hasVisitedRecoverBitcoin ?? DEFAULT_SETTINGS.hasVisitedRecoverBitcoin,
    };

    if (record.encryptedSensitiveData) {
      try {
        const sensitive = await decryptSensitiveSettingsWithPassword(
          record.encryptedSensitiveData,
          oldPassword
        );
        settings.lastActiveAddress = sensitive.lastActiveAddress;
        settings.connectedWebsites = sensitive.connectedWebsites;
        settings.pinnedAssets = sensitive.pinnedAssets;
      } catch {
        // Keep defaults for sensitive fields
      }
    }
  } else {
    // No encrypted data
    return;
  }

  // Re-encrypt with new password
  const newEncrypted = await encryptSettingsWithPassword(settings, newPassword);

  // Save in new format
  const newRecord: SettingsRecord = {
    id: SETTINGS_RECORD_ID,
    encryptedSettings: newEncrypted,
  };
  await updateRecord(newRecord);

  // Update session key with new password
  await initializeSettingsKey(newPassword);
}

// Legacy export alias for backward compatibility
export const reencryptSensitiveSettings = reencryptSettings;
