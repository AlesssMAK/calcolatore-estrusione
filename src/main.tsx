import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// NB: no separate `modern-normalize` — Tailwind v4's preflight already
// normalizes, and it lives in @layer base so utilities win. An unlayered
// modern-normalize would override Tailwind margin/padding utilities on form
// elements (e.g. mt-* on a <button> did nothing).
import 'react-datepicker/dist/react-datepicker.css';
import './index.css';
import './i18n';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
