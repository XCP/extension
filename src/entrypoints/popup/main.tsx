import './style.css';
import App from './app';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter as Router } from 'react-router-dom';
import { AppProviders } from '@/contexts/app-providers';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Router>
        <App />
      </Router>
    </AppProviders>
  </StrictMode>
);
