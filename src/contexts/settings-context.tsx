import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { getKeychainSettings, updateKeychainSettings, KeychainSettings } from '@/utils/storage';

interface SettingsContextValue {
  settings: KeychainSettings;
  updateSettings: (newSettings: Partial<KeychainSettings>) => Promise<void>;
  isLoading: boolean;
}

const defaultSettings: KeychainSettings = {
  autoLockTimeout: 5 * 60 * 1000,
  connectedWebsites: [],
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: false,
  autoLockTimer: '5m',
  enableMPMA: false,
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<KeychainSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const s = await getKeychainSettings();
      setSettings(s);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettingsHandler = useCallback(
    async (newSettings: Partial<KeychainSettings>) => {
      try {
        setIsLoading(true);
        await updateKeychainSettings(newSettings);
        const updated = await getKeychainSettings();
        setSettings(updated);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return (
    <SettingsContext.Provider value={{ settings, updateSettings: updateSettingsHandler, isLoading }}>
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
