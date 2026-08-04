import { type ReactElement, type ReactNode, useCallback, useEffect, useRef } from 'react';
import { ErrorBoundary } from '@/components/layout/error-boundary';
import { ApiStatusProvider } from '@/contexts/api-status-context';
import { HeaderProvider, useHeader } from '@/contexts/header-context';
import { SettingsProvider, useSettings } from '@/contexts/settings-context';
import { useWallet, WalletProvider } from '@/contexts/wallet-context';
import { getAutoLockTimeoutMs } from '@/core/settings';
import { useIdleTimer } from '@/hooks/useIdleTimer';

/**
 * Props for the AppProviders component.
 */
interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Drops the header caches when the keychain locks.
 *
 * They hold balances, owned assets and the addresses holding them. Locking is meant to drop that —
 * wallet-context nulls activeWallet and activeAddress on the same event — but HeaderProvider sits
 * above the routes and does not unmount when the UI returns to the unlock screen, so the holdings
 * would otherwise stay in memory across an explicit lock.
 *
 * This lives here rather than inside HeaderProvider so that header-context stays independent of
 * wallet-context: the wallet imports webext-bridge, which opens a runtime port at module load and
 * cannot be imported under jsdom.
 */
function ClearHeaderCachesOnLock(): null {
  const { keychainLocked } = useWallet();
  const { clearAllCaches } = useHeader();

  useEffect(() => {
    if (keychainLocked) clearAllCaches();
  }, [keychainLocked, clearAllCaches]);

  return null;
}

/**
 * Wraps children with idle timer functionality and manages wallet/settings loading states.
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {ReactElement | null} Idle timer wrapped content or null if not loaded
 */
function IdleTimerWrapper({ children }: { children: ReactNode }): ReactElement | null {
  const { setLastActiveTime, lockKeychain, isLoading: walletLoading, authState, hardwareOperationInProgress } = useWallet();
  const { settings, isLoading: settingsLoading, refreshSettings } = useSettings();
  const prevAuthStateRef = useRef(authState);

  // Re-fetch settings when wallet becomes unlocked.
  // On page reload, both popup and background need to restore from session storage.
  // Settings may be fetched before the background's keychain is restored, returning defaults.
  // This refresh ensures we get the correct settings after the keychain is confirmed loaded.
  useEffect(() => {
    if (prevAuthStateRef.current !== 'UNLOCKED' && authState === 'UNLOCKED' && !walletLoading) {
      refreshSettings();
    }
    prevAuthStateRef.current = authState;
  }, [authState, walletLoading, refreshSettings]);

  // Handle edge cases for idle timer
  const handleIdle = useCallback(() => {
    // Only lock if we're currently unlocked
    if (authState === 'UNLOCKED') {
      lockKeychain().catch(error => {
        console.error('[IdleTimer] Failed to lock keychain on idle:', error);
      });
    }
  }, [authState, lockKeychain]);

  const handleAction = useCallback(() => {
    // Only update last active time if we're unlocked
    if (authState === 'UNLOCKED') {
      setLastActiveTime();
    }
  }, [authState, setLastActiveTime]);

  const handleActive = useCallback(() => {
    // This only triggers when transitioning from idle back to active
    if (authState === 'UNLOCKED') {
      setLastActiveTime();
    }
  }, [authState, setLastActiveTime]);

  // Compute timeout from timer setting
  const autoLockTimeout = settings?.autoLockTimer ? getAutoLockTimeoutMs(settings.autoLockTimer) : 0;

  // Disable idle timer if timeout is 0 or undefined
  const isIdleTimerEnabled = autoLockTimeout > 0;

  // Use native idle timer hook - MUST be called before any early returns
  // Disabled during hardware wallet operations to prevent locking mid-confirmation
  useIdleTimer({
    timeout: autoLockTimeout,
    onIdle: handleIdle,
    onActive: handleActive,
    onAction: handleAction,
    disabled: !isIdleTimerEnabled || authState !== 'UNLOCKED' || walletLoading || settingsLoading || hardwareOperationInProgress,
    stopOnIdle: true,
  });

  if (walletLoading || settingsLoading) {
    // Wait for both wallet and settings to load before rendering
    return null;
  }

  return <>{children}</>;
}

/**
 * Provides all application-level context providers in a nested structure.
 * Each provider is wrapped in an error boundary for resilience.
 * @param {AppProvidersProps} props - Component props
 * @returns {ReactElement} Nested provider tree with error boundaries
 */
export function AppProviders({ children }: AppProvidersProps): ReactElement {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-dvh flex items-center justify-center p-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-2">Application Error</h2>
            <p className="text-sm text-gray-600">Please refresh the page to continue.</p>
          </div>
        </div>
      }
    >
      <ErrorBoundary
        fallback={
          <div className="min-h-dvh flex items-center justify-center p-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-2">Settings Error</h2>
              <p className="text-sm text-gray-600">Unable to load settings. Please refresh.</p>
            </div>
          </div>
        }
      >
        <SettingsProvider>
            <ErrorBoundary
              fallback={
                <div className="min-h-dvh flex items-center justify-center p-4">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold mb-2">Wallet Error</h2>
                    <p className="text-sm text-gray-600">Unable to load wallet. Please refresh.</p>
                  </div>
                </div>
              }
            >
              <WalletProvider>
                <IdleTimerWrapper>
                  <ApiStatusProvider>
                    <HeaderProvider>
                      <ClearHeaderCachesOnLock />
                      {children}
                    </HeaderProvider>
                  </ApiStatusProvider>
                </IdleTimerWrapper>
              </WalletProvider>
            </ErrorBoundary>
          </SettingsProvider>
      </ErrorBoundary>
    </ErrorBoundary>
  );
}
