import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureAuth } from './lib/auth-config';
import { App } from './App';
import { applyBrand } from './branding/brands';
import { currentBrand } from './branding/useBrand';
import './index.css';

// Brand first: it decides which Cognito app client we authenticate against,
// and applying it before render avoids a flash of the default brand.
const brand = currentBrand();
configureAuth(brand);
applyBrand(brand);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
