import type { CompanyCalc } from './sharedCalc';
import { activeCompanySlug } from './catalog';

// The Produzione page as the app's start page — a per-device switch (next to
// "Listino") — and the company calc it hands to the calculator to open.
const KEY = 'calc.productionStart';

export function loadProductionStart(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveProductionStart(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode — the switch just doesn't stick */
  }
}

// Decided once, as the app loads: it opens on the calculator's address (of a
// company — the page needs one) with the switch on → the Produzione page.
// Only that first time — after it, the calculator opens normally (a calc
// picked on the page, "← Produzione" and back).
const launchesOnProduction =
  typeof window !== 'undefined' &&
  window.location.pathname === '/' &&
  activeCompanySlug() !== null &&
  loadProductionStart();
let launchDone = false;

/** Should the calculator route hand over to the Produzione page (launch)? */
export function launchOnProduction(): boolean {
  return launchesOnProduction && !launchDone;
}

/** The Produzione page has shown: the launch is over. */
export function markLaunchDone(): void {
  launchDone = true;
}

// A calc picked on the Produzione page, for the calculator to open as it
// mounts (in memory: it's the same page load). Kept a moment, so a mount run
// twice (React's dev StrictMode) still finds it.
let pendingOpen: CompanyCalc | null = null;

export function stashCompanyOpen(calc: CompanyCalc): void {
  pendingOpen = calc;
}

export function takeCompanyOpen(): CompanyCalc | null {
  const calc = pendingOpen;
  if (calc) {
    window.setTimeout(() => {
      if (pendingOpen === calc) pendingOpen = null;
    }, 0);
  }
  return calc;
}
