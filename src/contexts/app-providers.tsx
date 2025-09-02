import React, { type ReactNode, type ReactElement } from 'react';
import { IdleTimerProvider } from 'react-idle-timer';
import { HeaderProvider } from './header-context';
import { LoadingProvider } from './loading-context';
import { PriceProvider } from './price-context';
import { SettingsProvider } from './settings-context';
import { WalletProvider } from './wallet-context';
import { useWallet } from './wallet-context';
import { useSettings } from './settings-context';

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
  const { setLastActiveTime, lockAll, loaded: walletLoaded } = useWallet();
  const { settings, isLoading: settingsLoading } = useSettings();

  if (!walletLoaded || settingsLoading) {
    // Wait for both wallet and settings to load before rendering
    return null;
  }

  return (
    <IdleTimerProvider
      timeout={settings.autoLockTimeout}
      onAction={setLastActiveTime}
      onIdle={lockAll}
    >
      {children}
    </IdleTimerProvider>
  );
}

/**
 * Provides all application-level context providers in a nested structure.
 * @param {AppProvidersProps} props - Component props
 * @returns {ReactElement} Nested provider tree
 */
export function AppProviders({ children }: AppProvidersProps): ReactElement {
  return (
    <LoadingProvider disableScroll={true}>
      <SettingsProvider>
        <WalletProvider>
          <IdleTimerWrapper>
            <HeaderProvider>
              <PriceProvider>
                {children}
              </PriceProvider>
            </HeaderProvider>
          </IdleTimerWrapper>
        </WalletProvider>
      </SettingsProvider>
    </LoadingProvider>
  );
}
