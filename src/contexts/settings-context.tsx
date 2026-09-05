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
 * Settings are encrypted and stored inside the keychain.
 * On wallet lock, settings reset to defaults (encryption key is cleared).
 *
 * ## Optimistic Updates
 *
 * State updates optimistically for instant UI response, with rollback
 * on persistence failure.
 */
import {
  createContext,
  type ReactElement,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onMessage } from 'webext-bridge/popup';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type AppSettings, DEFAULT_SETTINGS, setSettingsProvider } from "@/core/settings";
import { withStateLock } from "@/core/wallet/stateLockManager";
import { analytics } from "@/platform/fathom";
import { watchKeychainRecord } from "@/platform/storage/walletStorage";
import { getWalletService } from "@/services/walletService";

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
  const [loadError, setLoadError] = useState(false);
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false);
  // Core compose and approval code runs in this document, whereas walletService is a background
  // proxy. Publish the same loaded snapshot synchronously before rendering any settings consumer.
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const hasLoadedSettings = useRef(false);
  const loadVersion = useRef(0);
  const lockVersion = useRef(0);
  const invalidateSettingsRequests = useCallback(() => {
    lockVersion.current++;
    loadVersion.current++;
  }, []);
  const publishSettings = useCallback((next: AppSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  /**
   * @param showLoading - False when re-reading settings that changed elsewhere. Every surface
   *   consuming `isLoading` renders a spinner from it, so raising it for a change the user made in
   *   another window would flash all of them.
   */
  const loadSettings = useCallback(async (showLoading = true) => {
    const version = ++loadVersion.current;
    try {
      if (showLoading) setIsLoading(true);
      const walletService = getWalletService();
      const storedSettings = await walletService.getSettings();
      if (version === loadVersion.current) {
        hasLoadedSettings.current = true;
        setHasHydratedSettings(true);
        publishSettings(storedSettings);
        setLoadError(false);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Initial/unlock reads must not expose transaction pages using false-default protections.
      // A failed background refresh keeps the last known snapshot and the current screen.
      if (version === loadVersion.current && !hasLoadedSettings.current) {
        setLoadError(true);
      }
    } finally {
      if (version === loadVersion.current) setIsLoading(false);
    }
  }, [publishSettings]);

  useEffect(() => {
    const restoreSettingsProvider = setSettingsProvider(() => settingsRef.current);
    loadSettings();

    // Listen for wallet lock events from background
    // When locked, settings encryption key is cleared, so reset to defaults
    // Invalidate in-flight reads immediately so a late pre-lock reply cannot restore settings.
    const handleLockMessage = ({ data }: { data: { locked: boolean } }) => {
      if (data.locked) {
        invalidateSettingsRequests();
        hasLoadedSettings.current = false;
        setHasHydratedSettings(false);
        publishSettings({ ...DEFAULT_SETTINGS });
        setLoadError(false);
        setIsLoading(false);
      }
    };
    const unsubscribe = onMessage('keychainLocked', handleLockMessage);

    // Settings live inside the keychain record — one blob, one key derivation (#147) — so a change
    // made in any surface lands as a write to it. The popup and the side panel are separate
    // documents, each holding what it read on mount, and this is what stops one going stale while
    // the other edits. Serialized against loadSettings for the same reason the lock handler is.
    const stopWatching = watchKeychainRecord(() => {
      withStateLock('settings-lock', async () => {
        await loadSettings(false);
      });
    });

    return () => {
      unsubscribe();
      stopWatching();
      invalidateSettingsRequests();
      restoreSettingsProvider();
    };
  }, [invalidateSettingsRequests, loadSettings, publishSettings]);

  const updateSettingsHandler = useCallback(async (newSettings: Partial<AppSettings>) => {
    const version = lockVersion.current;
    const previous = settingsRef.current;
    const editVersion = ++loadVersion.current;
    try {
      // Optimistically update state for instant UI response
      const next = { ...settingsRef.current, ...newSettings };
      // Match WalletManager's normalization before a subsequent compose reads the snapshot.
      if (next.enableDieselMinting) next.protectAlkanesUtxos = true;
      publishSettings(next);

      // Persist to storage via background service
      const walletService = getWalletService();
      await walletService.updateSettings(newSettings);
      analytics.track('settings_changed');
    } catch (error) {
      console.error('Failed to persist settings:', error);
      // On error, reload from storage to get the authoritative state.
      // This avoids race conditions with stale rollback values when
      // multiple rapid updates are attempted.
      if (version === lockVersion.current) {
        if (editVersion === loadVersion.current) publishSettings(previous);
        await loadSettings();
      }
      throw error; // Re-throw to let component handle user feedback
    }
  }, [loadSettings, publishSettings]);

  const contextValue = useMemo(() => ({
    settings,
    updateSettings: updateSettingsHandler,
    refreshSettings: loadSettings,
    isLoading
  }), [settings, updateSettingsHandler, loadSettings, isLoading]);

  return (
    <SettingsContext value={contextValue}>
      {isLoading && !hasHydratedSettings && !loadError ? (
        <Spinner message="Loading settings…" className="min-h-dvh" />
      ) : loadError ? (
        <div className="min-h-dvh flex items-center justify-center p-6">
          <div className="space-y-4 text-center">
            <p role="alert" className="text-sm text-gray-700">
              Your saved settings could not be loaded. Retry to continue safely.
            </p>
            <Button fullWidth disabled={isLoading} onClick={() => void loadSettings()}>
              {isLoading ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </div>
      ) : children}
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
