import { useCallback, type ReactNode, type ReactElement } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { HeaderProvider } from './header-context';
import { LoadingProvider } from './loading-context';
import { PriceProvider } from './price-context';
import { SettingsProvider } from './settings-context';
import { WalletProvider } from './wallet-context';
import { useWallet } from './wallet-context';
import { useSettings } from './settings-context';
import { useIdleTimer } from '@/hooks/useIdleTimer';

/**
 * Props for the AppProviders component.
 */
interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Wraps children with idle timer functionality and manages wallet/settings loading states.
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {ReactElement | null} Idle timer wrapped content or null if not loaded
 */
function IdleTimerWrapper({ children }: { children: ReactNode }): ReactElement | null {
  const { setLastActiveTime, lockAll, loaded: walletLoaded, authState } = useWallet();
  const { settings, isLoading: settingsLoading } = useSettings();

  // Handle edge cases for idle timer
  const handleIdle = useCallback(() => {
    // Only lock if we're currently unlocked
    if (authState === 'UNLOCKED') {
      lockAll().catch(error => {
        console.error('[IdleTimer] Failed to lock wallet on idle:', error);
      });
    }
  }, [authState, lockAll]);

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

  // Disable idle timer if timeout is 0 or undefined
  const isIdleTimerEnabled = settings?.autoLockTimeout && settings.autoLockTimeout > 0;

  // Use native idle timer hook - MUST be called before any early returns
  useIdleTimer({
    timeout: settings?.autoLockTimeout || 0,
    onIdle: handleIdle,
    onActive: handleActive,
    onAction: handleAction,
    disabled: !isIdleTimerEnabled || authState !== 'UNLOCKED' || !walletLoaded || settingsLoading,
    stopOnIdle: true,
  });

  if (!walletLoaded || settingsLoading) {
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
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-2">Application Error</h2>
            <p className="text-sm text-gray-600">Please refresh the page to continue.</p>
          </div>
        </div>
      }
    >
      <LoadingProvider disableScroll={true}>
        <ErrorBoundary
          fallback={
            <div className="min-h-screen flex items-center justify-center p-4">
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
                <div className="min-h-screen flex items-center justify-center p-4">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold mb-2">Wallet Error</h2>
                    <p className="text-sm text-gray-600">Unable to load wallet. Please refresh.</p>
                  </div>
                </div>
              }
            >
              <WalletProvider>
                <IdleTimerWrapper>
                  <HeaderProvider>
                    <PriceProvider>
                      {children}
                    </PriceProvider>
                  </HeaderProvider>
                </IdleTimerWrapper>
              </WalletProvider>
            </ErrorBoundary>
          </SettingsProvider>
        </ErrorBoundary>
      </LoadingProvider>
    </ErrorBoundary>
  );
}
