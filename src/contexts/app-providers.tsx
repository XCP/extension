import React, { type ReactNode } from 'react';
import { ComposerProvider } from './composer-context';
import { HeaderProvider } from './header-context';
import { LoadingProvider } from './loading-context';
import { PriceProvider } from './price-context';
import { SettingsProvider } from './settings-context';
import { ToastProvider } from './toast-context';
import { WalletProvider } from './wallet-context';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ToastProvider>
      <LoadingProvider disableScroll={true}>
        <SettingsProvider>
          <WalletProvider>
            <HeaderProvider>
              <PriceProvider>
                <ComposerProvider>
                  {children}
                </ComposerProvider>
              </PriceProvider>
            </HeaderProvider>
          </WalletProvider>
        </SettingsProvider>
      </LoadingProvider>
    </ToastProvider>
  );
}
