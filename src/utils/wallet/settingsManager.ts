import { getKeychainSettings, updateKeychainSettings, KeychainSettings } from '@/utils/storage';

/**
 * SettingsManager is responsible for loading and updating persistent keychain settings,
 * such as auto‑lock timeouts and approved websites.
 *
 * This module does not handle runtime wallet operations.
 */
class SettingsManager {
  private settings: KeychainSettings | null = null;

  /**
   * Loads the persistent settings from storage.
   *
   * @returns A Promise that resolves to the loaded settings.
   */
  async loadSettings(): Promise<KeychainSettings> {
    this.settings = await getKeychainSettings();
    return this.settings;
  }

  /**
   * Updates the persistent settings.
   *
   * @param newSettings - Partial settings to update.
   */
  async updateSettings(newSettings: Partial<KeychainSettings>): Promise<void> {
    await updateKeychainSettings(newSettings);
    this.settings = await getKeychainSettings();
  }

  /**
   * Returns the currently loaded settings.
   *
   * @returns The current keychain settings, or null if not loaded.
   */
  getSettings(): KeychainSettings | null {
    return this.settings;
  }
}

export const settingsManager = new SettingsManager();
