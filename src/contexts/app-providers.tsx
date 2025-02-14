import React, { type ReactNode } from 'react';
import { ToastProvider } from './toast-context';
import { AuthProvider } from './auth-context';
import { SettingsProvider } from './settings-context';
import { WalletProvider } from './wallet-context';
import { HeaderProvider } from './header-context';
import { PriceProvider } from './price-context';
import { LoadingProvider } from './loading-context';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ToastProvider>
      <LoadingProvider>
        <AuthProvider>
          <SettingsProvider>
            <WalletProvider>
              <HeaderProvider>
                <PriceProvider>
                  {children}
                </PriceProvider>
              </HeaderProvider>
            </WalletProvider>
          </SettingsProvider>
        </AuthProvider>
      </LoadingProvider>
    </ToastProvider>
  );
}
