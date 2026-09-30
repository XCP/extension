import '@/entrypoints/popup/style.css';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter as Router } from 'react-router';
import { AppProviders } from '@/contexts/app-providers';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import { recordZeldReads } from '@/core/zeld/recordReads';
import App from '@/entrypoints/popup/app';
import { applyDocumentLocale } from '@/i18n';
import { getWalletServiceClient } from '@/services/walletServiceClient';
import { recordZeldOutpoints } from '@/services/zeldRecordClient';

applyDocumentLocale();
// Balance reads here keep the background's record of this wallet's ZELD outputs current.
recordZeldReads(recordZeldOutpoints);
// Sends here leave locked coins alone; the Coins settings page locks and unlocks them.
setCoinLockStore({
  read: address => getWalletServiceClient().getCoinLocks(address),
  update: (address, update) => getWalletServiceClient().updateCoinLocks(address, update),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Router>
        <App />
      </Router>
    </AppProviders>
  </StrictMode>
);
