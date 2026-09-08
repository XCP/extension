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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onMessage } from 'webext-bridge/popup';
import { type AppSettings, DEFAULT_SETTINGS, setSettingsProvider } from "@/core/settings";
import { withStateLock } from "@/core/wallet/stateLockManager";
import { configureLocale } from '@/i18n';
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
  // Core requests run in this document too. The foreground wallet singleton is not hydrated;
  // only settings received from the background or a completed save are authoritative here.
  const persistedSettings = useRef<AppSettings>(DEFAULT_SETTINGS);
  const generation = useRef(0);
  const revision = useRef(0);
  const latestRead = useRef(0);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    setSettingsProvider(() => persistedSettings.current);
    return () => {
      mounted.current = false;
      generation.current += 1;
      persistedSettings.current = DEFAULT_SETTINGS;
      setSettingsProvider(() => DEFAULT_SETTINGS);
    };
  }, []);

  useLayoutEffect(() => {
    configureLocale({ language: settings.language, numberLocale: settings.numberLocale });
  }, [settings.language, settings.numberLocale]);

  /**
   * @param showLoading - False when re-reading settings that changed elsewhere. Every surface
   *   consuming `isLoading` renders a spinner from it, so raising it for a change the user made in
   *   another window would flash all of them.
   */
  const loadSettings = useCallback(async (showLoading = true) => {
    const startedGeneration = generation.current;
    const startedRevision = revision.current;
    const read = ++latestRead.current;
    try {
      if (showLoading) setIsLoading(true);
      const walletService = getWalletService();
      const storedSettings = await walletService.getSettings();
      if (!mounted.current || generation.current !== startedGeneration
        || read !== latestRead.current || revision.current !== startedRevision) return;
      persistedSettings.current = storedSettings;
      setSettings(storedSettings);
    } finally {
      if (mounted.current && generation.current === startedGeneration
        && read === latestRead.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();

    // Listen for wallet lock events from background
    // When locked, settings encryption key is cleared, so reset to defaults
    // Invalidate pending replies immediately; a pre-lock read/save must not restore settings.
    const handleLockMessage = ({ data }: { data: { locked: boolean } }) => {
      if (data.locked) {
        generation.current += 1;
        persistedSettings.current = DEFAULT_SETTINGS;
        // This synchronous reset must not wait behind a watcher read: a new unlocked refresh
        // could otherwise finish first and then be erased when that old read releases the queue.
        setSettings({ ...DEFAULT_SETTINGS });
        setIsLoading(false);
      }
    };
    const unsubscribe = onMessage('keychainLocked', handleLockMessage);

    // Settings live inside the keychain record — one blob, one key derivation (#147) — so a change
    // made in any surface lands as a write to it. The popup and the side panel are separate
    // documents, each holding what it read on mount, and this is what stops one going stale while
    // the other edits. Watcher reads are serialized; generation/revision guards reject old replies.
    const stopWatching = watchKeychainRecord(() => {
      withStateLock('settings-lock', async () => {
        await loadSettings(false);
      });
    });

    return () => {
      unsubscribe();
      stopWatching();
    };
  }, [loadSettings]);

  const updateSettingsHandler = useCallback(async (newSettings: Partial<AppSettings>) => {
    const startedGeneration = generation.current;
    try {
      // Optimistically update state for instant UI response
      setSettings(prev => ({ ...prev, ...newSettings }));

      // Persist to storage via background service
      const walletService = getWalletService();
      await walletService.updateSettings(newSettings);
      if (!mounted.current || generation.current !== startedGeneration) return;
      persistedSettings.current = { ...persistedSettings.current, ...newSettings };
      revision.current += 1;
      analytics.track('settings_changed');
    } catch (error) {
      console.error('Failed to persist settings:', error);
      // On error, reload from storage to get the authoritative state.
      // This avoids race conditions with stale rollback values when
      // multiple rapid updates are attempted.
      if (mounted.current && generation.current === startedGeneration) await loadSettings(false);
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
