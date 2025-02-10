import './style.css';
import App from './app';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { IdleTimerProvider } from 'react-idle-timer';
import { HashRouter as Router } from 'react-router-dom';
import { AppProviders } from '@/contexts/app-providers';
import { getWalletService } from '@/services/walletService';

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
          <App />
        </Router>
      </AppProviders>
    </IdleTimerProvider>
  </React.StrictMode>
);
