import { storage } from 'wxt/storage';

/**
 * Interface for user settings stored in the keychain.
 */
export interface KeychainSettings {
  autoLockTimeout: number;    // Timeout in milliseconds (default 15 minutes).
  connectedWebsites: string[]; // Approved origins for dApp connections.
}

/**
 * Default settings for a new keychain.
 */
const DEFAULT_KEYCHAIN_SETTINGS: KeychainSettings = {
  autoLockTimeout: 15 * 60 * 1000, // 15 minutes.
  connectedWebsites: [],
};

/**
 * Defines a storage item for keychain settings under the key 'local:keychainSettings',
 * with a fallback to the default settings.
 */
const keychainSettingsStorage = storage.defineItem<KeychainSettings>('local:keychainSettings', {
  fallback: DEFAULT_KEYCHAIN_SETTINGS,
});

/**
 * Loads keychain settings from storage.
 *
 * @returns A Promise that resolves to the current keychain settings.
 */
export async function getKeychainSettings(): Promise<KeychainSettings> {
  return keychainSettingsStorage.getValue();
}

/**
 * Updates the keychain settings by merging new settings with existing ones.
 *
 * @param newSettings - Partial settings to update.
 */
export async function updateKeychainSettings(newSettings: Partial<KeychainSettings>): Promise<void> {
  const currentSettings = await getKeychainSettings();
  const updatedSettings = { ...currentSettings, ...newSettings };
  await keychainSettingsStorage.setValue(updatedSettings);
}
