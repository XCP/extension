import './style.css';
import App from './app';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { IdleTimerProvider } from 'react-idle-timer';
import { HashRouter as Router, useNavigate } from 'react-router-dom';
import { AppProviders } from '@/contexts/app-providers';
import { getWalletService } from '@/services/walletService';
import { walletManager } from '@/utils/wallet/walletManager';

// Singleton navigation handler
let navigateFn: (path: string, options?: { replace?: boolean }) => void;

function NavigationHandler() {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigateFn = navigate; // Capture navigate function
    const handleAutoLock = () => {
      console.log('Global Auto-lock triggered');
      navigate('/unlock-wallet', { replace: true });
      console.log('Global Navigation to /unlock-wallet attempted');
    };
    walletManager.registerAutoLockCallback(handleAutoLock);
    return () => walletManager.unregisterAutoLockCallback(handleAutoLock);
  }, [navigate]);
  return null;
}

const wallet = getWalletService();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IdleTimerProvider
      onAction={() => {
        wallet.setLastActiveTime();
      }}
    >
      <AppProviders>
        <Router>
          <NavigationHandler />
          <App />
        </Router>
      </AppProviders>
    </IdleTimerProvider>
  </React.StrictMode>
);
