import { storage } from 'wxt/storage';

export type AutoLockTimer = 'always' | '15m' | '30m';

/**
 * Unified KeychainSettings interface combines the original keychain settings
 * with the legacy user settings.
 */
export interface KeychainSettings {
  // Original keychain settings:
  autoLockTimeout: number;    // in milliseconds
  connectedWebsites: string[];

  // Legacy user settings:
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
  autoLockTimeout: 15 * 60 * 1000, // 15 minutes
  connectedWebsites: [],
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: false,
  autoLockTimer: 'always',
  enableMPMA: false,
};

/**
 * Define a storage item under the key "local:settings"
 * with a fallback to the default keychain settings.
 */
const keychainSettingsStorage = storage.defineItem<KeychainSettings>('local:settings', {
  fallback: DEFAULT_KEYCHAIN_SETTINGS,
});

/**
 * Loads the keychain settings from storage.
 * If older settings are found, migrates them to include the full unified interface.
 */
export async function getKeychainSettings(): Promise<KeychainSettings> {
  const stored = await keychainSettingsStorage.getValue();

  // If autoLockTimer is missing (from an older record), derive it from autoLockTimeout.
  let autoLockTimer: AutoLockTimer = stored.autoLockTimer;
  if (!stored.autoLockTimer && stored.autoLockTimeout !== undefined) {
    if (stored.autoLockTimeout === 0) {
      autoLockTimer = 'always';
    } else if (stored.autoLockTimeout === 15 * 60 * 1000) {
      autoLockTimer = '15m';
    } else if (stored.autoLockTimeout === 30 * 60 * 1000) {
      autoLockTimer = '30m';
    } else {
      autoLockTimer = 'always';
    }
  }

  return {
    ...DEFAULT_KEYCHAIN_SETTINGS,
    ...stored,
    autoLockTimer,
  };
}

/**
 * Updates the keychain settings by merging new settings with the current ones.
 * Also, if autoLockTimer is updated, autoLockTimeout is computed accordingly.
 */
export async function updateKeychainSettings(newSettings: Partial<KeychainSettings>): Promise<void> {
  const current = await getKeychainSettings();
  let updated: KeychainSettings = { ...current, ...newSettings };

  if (newSettings.autoLockTimer) {
    switch (newSettings.autoLockTimer) {
      case 'always':
        updated.autoLockTimeout = 0;
        break;
      case '15m':
        updated.autoLockTimeout = 15 * 60 * 1000;
        break;
      case '30m':
        updated.autoLockTimeout = 30 * 60 * 1000;
        break;
    }
  }
  await keychainSettingsStorage.setValue(updated);
}
