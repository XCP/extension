import React, { type ReactNode } from 'react';
import { HeaderProvider } from './header-context';
import { LoadingProvider } from './loading-context';
import { PriceProvider } from './price-context';
import { SettingsProvider } from './settings-context';
import { WalletProvider } from './wallet-context';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <LoadingProvider disableScroll={true}>
      <SettingsProvider>
        <WalletProvider>
          <HeaderProvider>
            <PriceProvider>
              {children}
            </PriceProvider>
          </HeaderProvider>
        </WalletProvider>
      </SettingsProvider>
    </LoadingProvider>
  );
}
