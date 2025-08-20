import {
  getAllRecords,
  addRecord,
  updateRecord,
  getRecordById,
  StoredRecord,
} from '@/utils/storage/storage';

/**
 * Defines the valid auto-lock timer options in minutes.
 */
export type AutoLockTimer = '1m' | '5m' | '15m' | '30m';

/**
 * Unified KeychainSettings interface for wallet configuration.
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
  enableAdvancedBroadcasts: boolean;
  transactionDryRun: boolean;
  pinnedAssets: string[];
  counterpartyApiBase: string;
  defaultOrderExpiration: number; // in blocks (default: 8064 = ~8 weeks)
}

/**
 * Default settings for new installations.
 */
export const DEFAULT_KEYCHAIN_SETTINGS: KeychainSettings = {
  lastActiveWalletId: undefined,
  lastActiveAddress: undefined,
  autoLockTimeout: 5 * 60 * 1000, // 5 minutes
  connectedWebsites: [],
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: true,
  autoLockTimer: '5m',
  enableMPMA: false,
  enableAdvancedBroadcasts: false,
  transactionDryRun: process.env.NODE_ENV === 'development',
  pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
  counterpartyApiBase: 'https://api.counterparty.io:4000',
  defaultOrderExpiration: 8064, // ~8 weeks (56 days) at 10min/block
};

/**
 * Unique ID for the settings record in storage.
 */
const SETTINGS_RECORD_ID = 'keychain-settings';

/**
 * Loads the keychain settings from storage.
 * Initializes with defaults if no settings exist.
 *
 * @returns A Promise resolving to the KeychainSettings object.
 */
export async function getKeychainSettings(): Promise<KeychainSettings> {
  const records = await getAllRecords();
  let storedRecord = records.find((r) => r.id === SETTINGS_RECORD_ID) as
    | StoredRecord & Partial<KeychainSettings>
    | undefined;

  if (!storedRecord) {
    storedRecord = { id: SETTINGS_RECORD_ID, ...DEFAULT_KEYCHAIN_SETTINGS };
    await addRecord(storedRecord);
  }

  const settings: KeychainSettings = {
    ...DEFAULT_KEYCHAIN_SETTINGS,
    ...storedRecord,
  };

  delete (settings as any).id;

  // Migration: If no autoLockTimer in stored record, set based on autoLockTimeout
  if (!storedRecord.autoLockTimer) {
    const minutes = settings.autoLockTimeout / (60 * 1000);
    if ([1, 5, 15, 30].includes(minutes)) {
      settings.autoLockTimer = `${minutes}m` as AutoLockTimer;
    } else {
      // Invalid or 0 -> default to 5m
      settings.autoLockTimer = '5m';
      settings.autoLockTimeout = 5 * 60 * 1000;
    }
    // Persist migration
    await updateKeychainSettings({ autoLockTimer: settings.autoLockTimer, autoLockTimeout: settings.autoLockTimeout }, settings);
  }

  // Handle invalid autoLockTimer
  if (!['1m', '5m', '15m', '30m'].includes(settings.autoLockTimer)) {
    settings.autoLockTimer = '5m';
    settings.autoLockTimeout = 5 * 60 * 1000;
    await updateKeychainSettings({ autoLockTimer: '5m', autoLockTimeout: 5 * 60 * 1000 }, settings);
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
    await updateKeychainSettings({ autoLockTimeout: expectedTimeout }, settings);
  }

  return settings;
}

/**
 * Updates the keychain settings by merging new settings with the current ones.
 * Adjusts autoLockTimeout based on autoLockTimer if provided.
 *
 * @param newSettings - Partial settings to update.
 * @param currentSettings - Optional current settings to avoid re-fetching (prevents recursion)
 * @returns A Promise that resolves when the update is complete.
 */
export async function updateKeychainSettings(newSettings: Partial<KeychainSettings>, currentSettings?: KeychainSettings): Promise<void> {
  const current = currentSettings || await getKeychainSettings();
  let updated: KeychainSettings = { ...current, ...newSettings };

  if (newSettings.autoLockTimer) {
    switch (newSettings.autoLockTimer) {
      case '1m':
        updated.autoLockTimeout = 1 * 60 * 1000;
        break;
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

  const updatedRecord: StoredRecord & KeychainSettings = {
    id: SETTINGS_RECORD_ID,
    ...updated,
  };

  const existingRecord = await getRecordById(SETTINGS_RECORD_ID);
  if (existingRecord) {
    await updateRecord(updatedRecord);
  } else {
    await addRecord(updatedRecord);
  }
}
