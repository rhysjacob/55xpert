import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureAuth } from './lib/auth-config';
import { App } from './App';
import { applyBrand } from './branding/brands';
import { currentBrand } from './branding/useBrand';
import './index.css';

configureAuth();
// Before render, so there is no flash of the default brand.
applyBrand(currentBrand());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
