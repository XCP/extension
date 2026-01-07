import {
  getAllRecords,
  addRecord,
  updateRecord,
  getRecordById,
  StoredRecord,
} from '@/utils/storage/storage';
import {
  SensitiveSettings,
  DEFAULT_SENSITIVE_SETTINGS,
  encryptSensitiveSettings,
  decryptSensitiveSettings,
  isSensitiveSettingsKeyAvailable,
} from '@/utils/encryption/sensitiveSettings';

/**
 * Defines the valid auto-lock timer options in minutes.
 */
export type AutoLockTimer = '1m' | '5m' | '15m' | '30m';

/**
 * Public settings that are safe to store unencrypted.
 */
export interface PublicSettings {
  lastActiveWalletId?: string;
  autoLockTimeout: number; // in milliseconds
  showHelpText: boolean;
  analyticsAllowed: boolean;
  allowUnconfirmedTxs: boolean;
  autoLockTimer: AutoLockTimer;
  enableMPMA: boolean;
  enableAdvancedBroadcasts: boolean;
  enableAdvancedBetting: boolean;
  transactionDryRun: boolean;
  counterpartyApiBase: string;
  defaultOrderExpiration: number; // in blocks (default: 8064 = ~8 weeks)
  hasVisitedRecoverBitcoin?: boolean;
}

/**
 * Unified KeychainSettings interface for wallet configuration.
 * Combines public settings with sensitive settings.
 */
export interface KeychainSettings extends PublicSettings, SensitiveSettings {}

/**
 * Storage record structure with encrypted sensitive data.
 */
interface SettingsRecord extends StoredRecord, PublicSettings {
  encryptedSensitiveData?: string;
  // Legacy fields (for migration) - will be encrypted and removed
  lastActiveAddress?: string;
  connectedWebsites?: string[];
  pinnedAssets?: string[];
}

/**
 * Default public settings for new installations.
 */
const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  lastActiveWalletId: undefined,
  autoLockTimeout: 5 * 60 * 1000, // 5 minutes default
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: true,
  autoLockTimer: '5m',
  enableMPMA: false,
  enableAdvancedBroadcasts: false,
  enableAdvancedBetting: false,
  transactionDryRun: process.env.NODE_ENV === 'development',
  counterpartyApiBase: 'https://api.counterparty.io:4000',
  defaultOrderExpiration: 8064, // ~8 weeks (56 days) at 10min/block
  hasVisitedRecoverBitcoin: false,
};

/**
 * Combined default settings (for backward compatibility).
 */
export const DEFAULT_KEYCHAIN_SETTINGS: KeychainSettings = {
  ...DEFAULT_PUBLIC_SETTINGS,
  ...DEFAULT_SENSITIVE_SETTINGS,
};

/**
 * Unique ID for the settings record in storage.
 */
const SETTINGS_RECORD_ID = 'keychain-settings';

/**
 * List of sensitive field names that should be encrypted.
 */
const SENSITIVE_FIELDS: (keyof SensitiveSettings)[] = [
  'lastActiveAddress',
  'connectedWebsites',
  'pinnedAssets',
];

/**
 * Loads the keychain settings from storage.
 * Sensitive settings are decrypted if the wallet is unlocked, otherwise defaults are used.
 *
 * @returns A Promise resolving to the KeychainSettings object.
 */
export async function getKeychainSettings(): Promise<KeychainSettings> {
  const records = await getAllRecords();
  let storedRecord = records.find((r) => r.id === SETTINGS_RECORD_ID) as SettingsRecord | undefined;

  if (!storedRecord) {
    storedRecord = { id: SETTINGS_RECORD_ID, ...DEFAULT_PUBLIC_SETTINGS };
    await addRecord(storedRecord);
  }

  // Build public settings
  const publicSettings: PublicSettings = {
    lastActiveWalletId: storedRecord.lastActiveWalletId ?? DEFAULT_PUBLIC_SETTINGS.lastActiveWalletId,
    autoLockTimeout: storedRecord.autoLockTimeout ?? DEFAULT_PUBLIC_SETTINGS.autoLockTimeout,
    showHelpText: storedRecord.showHelpText ?? DEFAULT_PUBLIC_SETTINGS.showHelpText,
    analyticsAllowed: storedRecord.analyticsAllowed ?? DEFAULT_PUBLIC_SETTINGS.analyticsAllowed,
    allowUnconfirmedTxs: storedRecord.allowUnconfirmedTxs ?? DEFAULT_PUBLIC_SETTINGS.allowUnconfirmedTxs,
    autoLockTimer: storedRecord.autoLockTimer ?? DEFAULT_PUBLIC_SETTINGS.autoLockTimer,
    enableMPMA: storedRecord.enableMPMA ?? DEFAULT_PUBLIC_SETTINGS.enableMPMA,
    enableAdvancedBroadcasts: storedRecord.enableAdvancedBroadcasts ?? DEFAULT_PUBLIC_SETTINGS.enableAdvancedBroadcasts,
    enableAdvancedBetting: storedRecord.enableAdvancedBetting ?? DEFAULT_PUBLIC_SETTINGS.enableAdvancedBetting,
    transactionDryRun: storedRecord.transactionDryRun ?? DEFAULT_PUBLIC_SETTINGS.transactionDryRun,
    counterpartyApiBase: storedRecord.counterpartyApiBase ?? DEFAULT_PUBLIC_SETTINGS.counterpartyApiBase,
    defaultOrderExpiration: storedRecord.defaultOrderExpiration ?? DEFAULT_PUBLIC_SETTINGS.defaultOrderExpiration,
    hasVisitedRecoverBitcoin: storedRecord.hasVisitedRecoverBitcoin ?? DEFAULT_PUBLIC_SETTINGS.hasVisitedRecoverBitcoin,
  };

  // Get sensitive settings (decrypt if available, otherwise use defaults)
  // Deep copy defaults to avoid shared array references
  let sensitiveSettings: SensitiveSettings = {
    lastActiveAddress: DEFAULT_SENSITIVE_SETTINGS.lastActiveAddress,
    connectedWebsites: [...DEFAULT_SENSITIVE_SETTINGS.connectedWebsites],
    pinnedAssets: [...DEFAULT_SENSITIVE_SETTINGS.pinnedAssets],
  };

  const keyAvailable = await isSensitiveSettingsKeyAvailable();

  if (keyAvailable && storedRecord.encryptedSensitiveData) {
    // Decrypt sensitive settings
    try {
      sensitiveSettings = await decryptSensitiveSettings(storedRecord.encryptedSensitiveData);
    } catch (err) {
      console.warn('Failed to decrypt sensitive settings, using defaults:', err);
    }
  } else if (!storedRecord.encryptedSensitiveData) {
    // Migration: Check for legacy unencrypted sensitive fields
    if (storedRecord.lastActiveAddress !== undefined ||
        storedRecord.connectedWebsites !== undefined ||
        storedRecord.pinnedAssets !== undefined) {
      sensitiveSettings = {
        lastActiveAddress: storedRecord.lastActiveAddress,
        connectedWebsites: storedRecord.connectedWebsites ?? DEFAULT_SENSITIVE_SETTINGS.connectedWebsites,
        pinnedAssets: storedRecord.pinnedAssets ?? DEFAULT_SENSITIVE_SETTINGS.pinnedAssets,
      };

      // If key is available, migrate by encrypting
      if (keyAvailable) {
        try {
          await migrateLegacySensitiveSettings(storedRecord, sensitiveSettings);
        } catch (err) {
          console.warn('Failed to migrate sensitive settings:', err);
        }
      }
    }
  }

  const settings: KeychainSettings = {
    ...publicSettings,
    ...sensitiveSettings,
  };

  // Handle migrations for autoLockTimer
  await migrateAutoLockTimer(storedRecord, settings);

  return settings;
}

/**
 * Migrates legacy unencrypted sensitive fields to encrypted storage.
 */
async function migrateLegacySensitiveSettings(
  record: SettingsRecord,
  sensitiveSettings: SensitiveSettings
): Promise<void> {
  // Encrypt the sensitive settings
  const encrypted = await encryptSensitiveSettings(sensitiveSettings);

  // Update record: add encrypted data, remove legacy fields
  const updatedRecord: SettingsRecord = {
    ...record,
    encryptedSensitiveData: encrypted,
  };

  // Remove legacy sensitive fields
  delete updatedRecord.lastActiveAddress;
  delete updatedRecord.connectedWebsites;
  delete updatedRecord.pinnedAssets;

  await updateRecord(updatedRecord);
  console.log('Migrated sensitive settings to encrypted storage');
}

/**
 * Handles autoLockTimer migration and validation.
 */
async function migrateAutoLockTimer(
  storedRecord: SettingsRecord,
  settings: KeychainSettings
): Promise<void> {
  let needsUpdate = false;
  const updates: Partial<KeychainSettings> = {};

  // Migration: If no autoLockTimer in stored record, set based on autoLockTimeout
  if (!storedRecord.autoLockTimer) {
    const milliseconds = settings.autoLockTimeout;
    const minutes = milliseconds / (60 * 1000);
    if ([1, 5, 15, 30].includes(minutes)) {
      settings.autoLockTimer = `${minutes}m` as AutoLockTimer;
    } else {
      settings.autoLockTimer = '5m';
      settings.autoLockTimeout = 5 * 60 * 1000;
    }
    updates.autoLockTimer = settings.autoLockTimer;
    updates.autoLockTimeout = settings.autoLockTimeout;
    needsUpdate = true;
  }

  // Handle invalid autoLockTimer
  if (!['1m', '5m', '15m', '30m'].includes(settings.autoLockTimer)) {
    settings.autoLockTimer = '5m';
    settings.autoLockTimeout = 5 * 60 * 1000;
    updates.autoLockTimer = '5m';
    updates.autoLockTimeout = 5 * 60 * 1000;
    needsUpdate = true;
  }

  // Ensure consistency between autoLockTimer and autoLockTimeout
  const expectedTimeout = {
    '1m': 1 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
  }[settings.autoLockTimer];

  if (settings.autoLockTimeout !== expectedTimeout) {
    settings.autoLockTimeout = expectedTimeout;
    updates.autoLockTimeout = expectedTimeout;
    needsUpdate = true;
  }

  if (needsUpdate) {
    await updateKeychainSettings(updates, settings);
  }
}

/**
 * Updates the keychain settings by merging new settings with the current ones.
 * Sensitive settings are encrypted before storage.
 *
 * @param newSettings - Partial settings to update.
 * @param currentSettings - Optional current settings to avoid re-fetching (prevents recursion)
 * @returns A Promise that resolves when the update is complete.
 */
export async function updateKeychainSettings(
  newSettings: Partial<KeychainSettings>,
  currentSettings?: KeychainSettings
): Promise<void> {
  const current = currentSettings || await getKeychainSettings();
  let updated: KeychainSettings = { ...current, ...newSettings };

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

  // Check if we're updating sensitive fields
  const hasSensitiveUpdates = SENSITIVE_FIELDS.some(
    (field) => field in newSettings
  );

  // Build the storage record
  const existingRecord = await getRecordById(SETTINGS_RECORD_ID) as SettingsRecord | undefined;

  const updatedRecord: SettingsRecord = {
    id: SETTINGS_RECORD_ID,
    // Public fields
    lastActiveWalletId: updated.lastActiveWalletId,
    autoLockTimeout: updated.autoLockTimeout,
    showHelpText: updated.showHelpText,
    analyticsAllowed: updated.analyticsAllowed,
    allowUnconfirmedTxs: updated.allowUnconfirmedTxs,
    autoLockTimer: updated.autoLockTimer,
    enableMPMA: updated.enableMPMA,
    enableAdvancedBroadcasts: updated.enableAdvancedBroadcasts,
    enableAdvancedBetting: updated.enableAdvancedBetting,
    transactionDryRun: updated.transactionDryRun,
    counterpartyApiBase: updated.counterpartyApiBase,
    defaultOrderExpiration: updated.defaultOrderExpiration,
    hasVisitedRecoverBitcoin: updated.hasVisitedRecoverBitcoin,
    // Preserve existing encrypted data unless we're updating sensitive fields
    encryptedSensitiveData: existingRecord?.encryptedSensitiveData,
  };

  // If updating sensitive fields, encrypt them
  if (hasSensitiveUpdates) {
    const keyAvailable = await isSensitiveSettingsKeyAvailable();
    if (!keyAvailable) {
      throw new Error('Cannot update sensitive settings when wallet is locked');
    }

    const sensitiveData: SensitiveSettings = {
      lastActiveAddress: updated.lastActiveAddress,
      connectedWebsites: updated.connectedWebsites,
      pinnedAssets: updated.pinnedAssets,
    };

    updatedRecord.encryptedSensitiveData = await encryptSensitiveSettings(sensitiveData);
  }

  if (existingRecord) {
    await updateRecord(updatedRecord);
  } else {
    await addRecord(updatedRecord);
  }
}

/**
 * Re-encrypts sensitive settings with a new password.
 * Called during password change.
 */
export async function reencryptSensitiveSettings(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const {
    decryptSensitiveSettingsWithPassword,
    encryptSensitiveSettingsWithPassword,
    initializeSensitiveSettingsKey,
  } = await import('@/utils/encryption/sensitiveSettings');

  const record = await getRecordById(SETTINGS_RECORD_ID) as SettingsRecord | undefined;

  if (!record?.encryptedSensitiveData) {
    // No encrypted data to migrate
    return;
  }

  // Decrypt with old password
  const sensitiveData = await decryptSensitiveSettingsWithPassword(
    record.encryptedSensitiveData,
    oldPassword
  );

  // Re-encrypt with new password
  const newEncrypted = await encryptSensitiveSettingsWithPassword(
    sensitiveData,
    newPassword
  );

  // Update storage
  record.encryptedSensitiveData = newEncrypted;
  await updateRecord(record);

  // Update session key with new password
  await initializeSensitiveSettingsKey(newPassword);
}
