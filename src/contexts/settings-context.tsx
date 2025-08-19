import React, {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { getKeychainSettings, updateKeychainSettings, type KeychainSettings } from "@/utils/storage";

/**
 * Context value for settings management.
 */
interface SettingsContextValue {
  settings: KeychainSettings;
  updateSettings: (newSettings: Partial<KeychainSettings>) => Promise<void>;
  isLoading: boolean;
}

const defaultSettings: KeychainSettings = {
  lastActiveWalletId: undefined,
  lastActiveAddress: undefined,
  autoLockTimeout: 5 * 60 * 1000,
  connectedWebsites: [],
  showHelpText: false,
  analyticsAllowed: true,
  allowUnconfirmedTxs: false,
  autoLockTimer: "5m",
  enableMPMA: false,
  enableAdvancedBroadcasts: false,
  transactionDryRun: false,
  pinnedAssets: ["XCP", "PEPECASH", "BITCRYSTALS", "BITCORN", "CROPS", "MINTS"],
  counterpartyApiBase: 'https://api.counterparty.io:4000',
  defaultOrderExpiration: 1000
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

/**
 * Provides settings context to the application using React 19's <Context>.
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {ReactElement} Context provider
 */
export function SettingsProvider({ children }: { children: ReactNode }): ReactElement {
  const [settings, setSettings] = useState<KeychainSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const storedSettings = await getKeychainSettings();
      setSettings(storedSettings);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettingsHandler = useCallback(async (newSettings: Partial<KeychainSettings>) => {
    try {
      setIsLoading(true);
      await updateKeychainSettings(newSettings);
      const updated = await getKeychainSettings();
      setSettings(updated);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <SettingsContext value={{ settings, updateSettings: updateSettingsHandler, isLoading }}>
      {children}
    </SettingsContext>
  );
}

/**
 * Hook to access settings context using React 19's `use`.
 * @returns {SettingsContextValue} Settings context value
 * @throws {Error} If used outside SettingsProvider
 */
export function useSettings(): SettingsContextValue {
  const context = React.use(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
