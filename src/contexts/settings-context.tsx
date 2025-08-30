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
  allowUnconfirmedTxs: true,
  autoLockTimer: "5m",
  enableMPMA: false,
  enableAdvancedBroadcasts: false,
  enableAdvancedBetting: false,
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
    // Store previous settings in case we need to revert
    const previousSettings = settings;
    
    // Update state immediately for instant UI response
    setSettings(prev => ({ ...prev, ...newSettings }));
    
    try {
      // Then persist to storage
      await updateKeychainSettings(newSettings);
    } catch (error) {
      // Revert to previous settings on failure
      setSettings(previousSettings);
      throw error; // Re-throw to let caller handle
    }
  }, [settings]);

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
