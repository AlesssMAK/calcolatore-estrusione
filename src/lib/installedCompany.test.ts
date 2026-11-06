import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeCompanySlug } from './catalog';
import {
  isInstalledApp,
  loadInstalledCompany,
  parseCompanyInput,
  saveInstalledCompany,
} from './installedCompany';

function installed(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query === '(display-mode: standalone)',
  }));
}

function address(url: string) {
  window.history.replaceState(null, '', url);
}

beforeEach(() => {
  localStorage.clear();
  installed(false);
  address('/');
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('what was pasted or typed', () => {
  it.each([
    ['https://extrusion-calculator.com/?company=akra-plast', 'akra-plast'],
    ['https://www.extrusion-calculator.com/produzione?company=akra-plast', 'akra-plast'],
    ['extrusion-calculator.com/?lang=it&company=akra-plast#top', 'akra-plast'],
    ['  akra-plast \n', 'akra-plast'],
    ['Akra-Plast', 'akra-plast'],
  ])('%s', (text, slug) => {
    expect(parseCompanyInput(text)).toBe(slug);
  });

  it.each(['', '   ', 'https://extrusion-calculator.com/', '?company=', 'akra plast', '%zz'])(
    'nothing to connect in "%s"',
    (text) => {
      expect(parseCompanyInput(text)).toBeNull();
    },
  );
});

describe('the installed app', () => {
  it('is told by its own window', () => {
    expect(isInstalledApp()).toBe(false);
    installed(true);
    expect(isInstalledApp()).toBe(true);
  });

  it('is told on an iPhone too', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isInstalledApp()).toBe(true);
  });

  it('remembers its company', () => {
    installed(true);
    expect(loadInstalledCompany()).toBeNull();
    expect(saveInstalledCompany('akra-plast')).toBe(true);
    expect(loadInstalledCompany()).toBe('akra-plast');
  });
});

describe('the active company', () => {
  it('on the site: only the link', () => {
    saveInstalledCompany('akra-plast'); // Android shares the storage
    expect(activeCompanySlug()).toBeNull();
    address('/?company=bianca');
    expect(activeCompanySlug()).toBe('bianca');
  });

  it('in the installed app: the connected one', () => {
    installed(true);
    saveInstalledCompany('akra-plast');
    expect(activeCompanySlug()).toBe('akra-plast');
  });

  it('wins over an address that no longer works', () => {
    installed(true);
    saveInstalledCompany('akra-plast');
    address('/?company=old-name');
    expect(activeCompanySlug()).toBe('akra-plast');
  });

  it('an app installed with its company, never connected, keeps the link', () => {
    installed(true);
    address('/?company=bianca');
    expect(activeCompanySlug()).toBe('bianca');
  });
});
