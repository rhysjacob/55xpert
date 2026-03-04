import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureAuth } from './lib/auth-config';
import { App } from './App';
import './index.css';

configureAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
