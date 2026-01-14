/**
 * @module settings-context
 *
 * Application settings management with persistence and cross-tab sync.
 *
 * Settings include:
 * - Network configuration (mainnet/testnet)
 * - UI preferences (order type defaults, pinned assets)
 * - Security settings (auto-lock timer, connected websites)
 * - Advanced options (custom API endpoints, fee preferences)
 *
 * ## Persistence
 *
 * Settings are encrypted and stored using `settingsStorage`.
 * On wallet lock, settings reset to defaults (encryption key is cleared).
 *
 * ## Optimistic Updates
 *
 * State updates optimistically for instant UI response, with rollback
 * on persistence failure.
 */
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
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS,
  type AppSettings,
} from "@/utils/storage/settingsStorage";
import { withStateLock } from "@/utils/wallet/stateLockManager";

/**
 * Public API for settings management.
 */
interface SettingsContextType {
  /** Current application settings */
  settings: AppSettings;
  /** Update one or more settings (persisted to storage) */
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  /** Force reload settings from storage */
  refreshSettings: () => Promise<void>;
  /** True while loading initial settings */
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

/**
 * Provides settings context to the application using React 19's <Context>.
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {ReactElement} Context provider
 */
export function SettingsProvider({ children }: { children: ReactNode }): ReactElement {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const storedSettings = await getSettings();
      setSettings(storedSettings);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();

    // Listen for wallet lock events from background
    // When locked, settings encryption key is cleared, so reset to defaults
    // Use withStateLock to serialize with any concurrent loadSettings operations
    const handleLockMessage = ({ data }: { data: { locked: boolean } }) => {
      if (data.locked) {
        withStateLock('settings-lock', async () => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[SettingsContext] Lock event - resetting to defaults');
          }
          setSettings({ ...DEFAULT_SETTINGS });
        });
      }
    };
    const unsubscribe = onMessage('keychainLocked', handleLockMessage);

    return () => {
      unsubscribe();
    };
  }, [loadSettings]);

  const updateSettingsHandler = useCallback(async (newSettings: Partial<AppSettings>) => {
    try {
      // Optimistically update state for instant UI response
      setSettings(prev => ({ ...prev, ...newSettings }));

      // Persist to storage
      await updateSettings(newSettings);
    } catch (error) {
      console.error('Failed to persist settings:', error);
      // On error, reload from storage to get the authoritative state.
      // This avoids race conditions with stale rollback values when
      // multiple rapid updates are attempted.
      await loadSettings();
      throw error; // Re-throw to let component handle user feedback
    }
  }, [loadSettings]);

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
 * @returns {SettingsContextType} Settings context value
 * @throws {Error} If used outside SettingsProvider
 */
export function useSettings(): SettingsContextType {
  const context = use(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
