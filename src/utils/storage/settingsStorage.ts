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
  pinnedAssets: string[];
}

/**
 * Default settings for new installations.
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
  pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
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
  return settings;
}

/**
 * Updates the keychain settings by merging new settings with the current ones.
 * Adjusts autoLockTimeout based on autoLockTimer if provided.
 *
 * @param newSettings - Partial settings to update.
 * @returns A Promise that resolves when the update is complete.
 */
export async function updateKeychainSettings(newSettings: Partial<KeychainSettings>): Promise<void> {
  const current = await getKeychainSettings();
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
