import '@/entrypoints/popup/style.css';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter as Router } from 'react-router';
import { AppProviders } from '@/contexts/app-providers';
import App from '@/entrypoints/popup/app';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Router>
        <App />
      </Router>
    </AppProviders>
  </StrictMode>
);
