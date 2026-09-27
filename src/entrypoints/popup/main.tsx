import '@/entrypoints/popup/style.css';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter as Router } from 'react-router';
import { AppProviders } from '@/contexts/app-providers';
import { recordZeldReads } from '@/core/zeld/recordReads';
import App from '@/entrypoints/popup/app';
import { applyDocumentLocale } from '@/i18n';
import { recordZeldOutpoints } from '@/services/zeldRecordClient';

applyDocumentLocale();
// Balance reads here keep the background's record of this wallet's ZELD outputs current.
recordZeldReads(recordZeldOutpoints);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Router>
        <App />
      </Router>
    </AppProviders>
  </StrictMode>
);
