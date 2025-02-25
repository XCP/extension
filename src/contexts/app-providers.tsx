import React, { type ReactNode } from 'react';
import { IdleTimerProvider } from 'react-idle-timer';
import { ComposerProvider } from './composer-context';
import { HeaderProvider } from './header-context';
import { LoadingProvider } from './loading-context';
import { PriceProvider } from './price-context';
import { SettingsProvider } from './settings-context';
import { WalletProvider } from './wallet-context';
import { useWallet } from './wallet-context';
import { useSettings } from './settings-context';

interface AppProvidersProps {
  children: ReactNode;
}

function IdleTimerWrapper({ children }: { children: ReactNode }) {
  const { setLastActiveTime, lockAll, loaded: walletLoaded } = useWallet();
  const { settings, isLoading: settingsLoading } = useSettings();

  if (!walletLoaded || settingsLoading) {
    // Wait for both wallet and settings to load
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

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <LoadingProvider disableScroll={true}>
      <SettingsProvider>
        <WalletProvider>
          <IdleTimerWrapper>
            <HeaderProvider>
              <PriceProvider>
                <ComposerProvider>
                  {children}
                </ComposerProvider>
              </PriceProvider>
            </HeaderProvider>
          </IdleTimerWrapper>
        </WalletProvider>
      </SettingsProvider>
    </LoadingProvider>
  );
}