import {
  getAllRecords,
  addRecord,
  updateRecord,
  getRecordById,
  StoredRecord,
} from '@/utils/storage';

/**
 * Defines the valid auto-lock timer options in minutes.
 */
export type AutoLockTimer = '5m' | '15m' | '30m';

/**
 * Unified KeychainSettings interface combines the original keychain settings
 * with the legacy user settings.
 */
export interface KeychainSettings {
  lastActiveWalletId?: string;
  lastActiveAddress?: string;
  autoLockTimeout: number; // in milliseconds
  connectedWebsites: string[];
  showHelpText: boolean;
  analyticsAllowed: boolean;
  allowUnconfirmedTxs: boolean;
  autoLockTimer: AutoLockTimer;
  enableMPMA: boolean;
}

/**
 * Fallback defaults for new installations.
 */
const DEFAULT_KEYCHAIN_SETTINGS: KeychainSettings = {
  lastActiveWalletId: undefined,
  lastActiveAddress: undefined,
  autoLockTimeout: 5 * 60 * 1000, // 5 minutes
  connectedWebsites: [],
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: false,
  autoLockTimer: '5m',
  enableMPMA: false,
};

/**
 * Unique ID for the settings record in storage.
 */
const SETTINGS_RECORD_ID = 'keychain-settings';

/**
 * Loads the keychain settings from storage.
 * If no settings exist, initializes with defaults and stores them.
 * Migrates older settings to the current format, ensuring autoLockTimer is valid.
 *
 * @returns A Promise resolving to the KeychainSettings object.
 */
export async function getKeychainSettings(): Promise<KeychainSettings> {
  const records = await getAllRecords();
  let storedRecord = records.find((r) => r.id === SETTINGS_RECORD_ID) as
    | StoredRecord & Partial<KeychainSettings>
    | undefined;

  // If no settings record exists, create it with defaults
  if (!storedRecord) {
    storedRecord = { id: SETTINGS_RECORD_ID, ...DEFAULT_KEYCHAIN_SETTINGS };
    await addRecord(storedRecord);
  }

  // Migrate or validate autoLockTimer
  let autoLockTimer: AutoLockTimer = storedRecord.autoLockTimer || '5m';
  let autoLockTimeout = storedRecord.autoLockTimeout ?? 5 * 60 * 1000;
  if (!['5m', '15m', '30m'].includes(autoLockTimer)) {
    // Handle legacy 'always' or invalid values by defaulting to '5m'
    autoLockTimer = '5m';
    autoLockTimeout = 5 * 60 * 1000;
  } else {
    // Ensure autoLockTimeout matches autoLockTimer
    switch (autoLockTimer) {
      case '5m':
        autoLockTimeout = 5 * 60 * 1000;
        break;
      case '15m':
        autoLockTimeout = 15 * 60 * 1000;
        break;
      case '30m':
        autoLockTimeout = 30 * 60 * 1000;
        break;
    }
  }

  // If autoLockTimer is missing but autoLockTimeout exists (older record), derive it
  if (!storedRecord.autoLockTimer && storedRecord.autoLockTimeout !== undefined) {
    if (storedRecord.autoLockTimeout === 15 * 60 * 1000) {
      autoLockTimer = '15m';
      autoLockTimeout = 15 * 60 * 1000;
    } else if (storedRecord.autoLockTimeout === 30 * 60 * 1000) {
      autoLockTimer = '30m';
      autoLockTimeout = 30 * 60 * 1000;
    } else {
      autoLockTimer = '5m';
      autoLockTimeout = 5 * 60 * 1000; // Default for 0 or other values
    }
  }

  const settings: KeychainSettings = {
    ...DEFAULT_KEYCHAIN_SETTINGS,
    ...storedRecord,
    autoLockTimer,
    autoLockTimeout,
  };

  // Remove the 'id' field from the returned settings to match the interface
  delete (settings as any).id;

  return settings;
}

/**
 * Updates the keychain settings by merging new settings with the current ones.
 * Computes autoLockTimeout based on autoLockTimer if provided.
 *
 * @param newSettings - Partial settings to update.
 * @returns A Promise that resolves when the update is complete.
 * @throws Error if the settings record cannot be updated (e.g., storage failure).
 */
export async function updateKeychainSettings(newSettings: Partial<KeychainSettings>): Promise<void> {
  const current = await getKeychainSettings();
  let updated: KeychainSettings = { ...current, ...newSettings };

  // Update autoLockTimeout if autoLockTimer is provided
  if (newSettings.autoLockTimer) {
    switch (newSettings.autoLockTimer) {
      case '5m':
        updated.autoLockTimeout = 5 * 60 * 1000;
        break;
      case '15m':
        updated.autoLockTimeout = 15 * 60 * 1000;
        break;
      case '30m':
        updated.autoLockTimeout = 30 * 60 * 1000;
        break;
    }
    updated.autoLockTimer = newSettings.autoLockTimer;
  }

  // Update the stored record
  const updatedRecord: StoredRecord & KeychainSettings = {
    id: SETTINGS_RECORD_ID,
    ...updated,
  };

  const existingRecord = await getRecordById(SETTINGS_RECORD_ID);
  if (existingRecord) {
    await updateRecord(updatedRecord);
  } else {
    // This shouldn’t happen due to getKeychainSettings creating it, but handle gracefully
    await addRecord(updatedRecord);
  }
}
