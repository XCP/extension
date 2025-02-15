import { describe, it, expect, beforeEach } from 'vitest';
import { getKeychainSettings, updateKeychainSettings } from '@/utils/storage/settingsStorage';
import { storage } from 'wxt/storage';

// Clear the storage item before each test.
beforeEach(async () => {
  await storage.removeItem('local:settings');
});

describe('Settings Storage', () => {
  it('should return default settings when none are stored', async () => {
    const settings = await getKeychainSettings();
    expect(settings.autoLockTimeout).toBe(5 * 60 * 1000);
    expect(settings.connectedWebsites).toEqual([]);
  });

  it('should update and persist settings', async () => {
    await updateKeychainSettings({ showHelpText: true });
    const settings = await getKeychainSettings();
    expect(settings.showHelpText).toBe(true);
  });
});
