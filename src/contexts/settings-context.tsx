import React, { createContext, useState, useContext, useCallback, useEffect, type ReactNode } from 'react';
import { getKeychainSettings, updateKeychainSettings, type KeychainSettings } from '@/utils/storage';

interface SettingsContextValue {
  settings: KeychainSettings;
  updateSettings: (newSettings: Partial<KeychainSettings>) => Promise<void>;
}

const defaultSettings: KeychainSettings = {
  autoLockTimeout: 15 * 60 * 1000,
  connectedWebsites: [],
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<KeychainSettings>(defaultSettings);

  const loadSettings = useCallback(async () => {
    const s = await getKeychainSettings();
    setSettings(s);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettingsHandler = useCallback(
    async (newSettings: Partial<KeychainSettings>) => {
      await updateKeychainSettings(newSettings);
      const updated = await getKeychainSettings();
      setSettings(updated);
    },
    []
  );

  return (
    <SettingsContext.Provider value={{ settings, updateSettings: updateSettingsHandler }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
