import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  use,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { onMessage } from 'webext-bridge/popup';
import {
  getKeychainSettings,
  updateKeychainSettings,
  DEFAULT_KEYCHAIN_SETTINGS,
  type KeychainSettings
} from "@/utils/storage/settingsStorage";

/**
 * Context value for settings management.
 */
interface SettingsContextValue {
  settings: KeychainSettings;
  updateSettings: (newSettings: Partial<KeychainSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

/**
 * Provides settings context to the application using React 19's <Context>.
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {ReactElement} Context provider
 */
export function SettingsProvider({ children }: { children: ReactNode }): ReactElement {
  const [settings, setSettings] = useState<KeychainSettings>(DEFAULT_KEYCHAIN_SETTINGS);
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

    // Listen for wallet lock events from background
    // When locked, settings encryption key is cleared, so reset to defaults
    const handleLockMessage = ({ data }: { data: { locked: boolean } }) => {
      if (data.locked) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[SettingsContext] Lock event - resetting to defaults');
        }
        setSettings({ ...DEFAULT_KEYCHAIN_SETTINGS });
      }
    };
    const unsubscribe = onMessage('walletLocked', handleLockMessage);

    return () => {
      unsubscribe();
    };
  }, [loadSettings]);

  const updateSettingsHandler = useCallback(async (newSettings: Partial<KeychainSettings>) => {
    // Capture previous state for rollback
    const previousSettings = settings;

    try {
      // Optimistically update state for instant UI response
      setSettings(prev => ({ ...prev, ...newSettings }));

      // Persist to storage
      await updateKeychainSettings(newSettings);
    } catch (error) {
      console.error('Failed to persist settings:', error);
      // Immediately revert to previous state
      setSettings(previousSettings);
      // Also reload from storage to ensure consistency
      loadSettings();
      throw error; // Re-throw to let component handle user feedback
    }
  }, [settings, loadSettings]);

  const contextValue = useMemo(() => ({
    settings,
    updateSettings: updateSettingsHandler,
    refreshSettings: loadSettings,
    isLoading
  }), [settings, updateSettingsHandler, loadSettings, isLoading]);

  return (
    <SettingsContext value={contextValue}>
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
  const context = use(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
