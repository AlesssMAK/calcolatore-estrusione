// The company of the installed app ("Collega Azienda").
//
// The site is URL-only, but an iPhone installs the app without the link's
// ?company=, and the app has no address bar to give it one. So the installed
// app, and only it, can be connected to a company once, on this device. Android
// shares this storage with the browser: hence the check, so the site stays
// clean there too.
const KEY = 'calc.installedCompany';

/** Running in its own window, installed on this device? */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || !!window.matchMedia?.('(display-mode: standalone)').matches;
}

/** The company this installed app was connected to. */
export function loadInstalledCompany(): string | null {
  if (!isInstalledApp()) return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** False when it couldn't be kept. */
export function saveInstalledCompany(slug: string): boolean {
  try {
    window.localStorage.setItem(KEY, slug);
    return true;
  } catch {
    return false;
  }
}

/** The company slug in what was pasted or typed: a link with ?company=<slug>, or
 *  the slug itself (an iPhone capitalizes its first letter). */
export function parseCompanyInput(text: string): string | null {
  const value = text.trim();
  const inLink = value.match(/[?&]company=([^&#\s]*)/);
  const slug = (inLink ? inLink[1] : value).toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}
