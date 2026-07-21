import { supabase } from './supabase';
import type { WeekendDay, WeekdayKey, WeekSchedule } from '../types';
export type { WeekdayKey, WeekSchedule } from '../types';

export interface Company {
  id: string;
  slug: string;
  name: string;
}

export type CalcModes = 'sheets' | 'profiles' | 'both';
export const WEEKDAY_KEYS: WeekdayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

/** Per-company settings, configured in /admin and consumed by the calculator
 *  opened via ?company=<slug>. */
export interface CompanySettings {
  /** Which calculator tabs to show. */
  modes: CalcModes;
  /** Show the Piramide (nesting) page + footer link. */
  showPiramide: boolean;
  /** Per-day working hours (7 days). null → app default (Mon–Fri 24h). */
  schedule: WeekSchedule | null;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  modes: 'both',
  showPiramide: true,
  schedule: null,
};

function parseDay(raw: unknown): WeekendDay {
  const p = (raw ?? {}) as Partial<WeekendDay>;
  const half = (v: unknown, d: number) =>
    Number.isFinite(v)
      ? Math.min(24, Math.max(0, Math.round(Number(v) * 2) / 2))
      : d;
  return {
    enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
    full24: !!p.full24,
    start: half(p.start, 6),
    end: half(p.end, 22),
  };
}

/** Tolerant parse of the stored JSON into CompanySettings (defaults on gaps). */
export function normalizeCompanySettings(raw: unknown): CompanySettings {
  const p = (raw ?? {}) as Record<string, unknown>;
  const modes: CalcModes =
    p.modes === 'sheets' || p.modes === 'profiles' ? p.modes : 'both';
  const showPiramide = p.showPiramide !== false; // default true
  let schedule: WeekSchedule | null = null;
  if (p.schedule && typeof p.schedule === 'object') {
    const src = p.schedule as Record<string, unknown>;
    schedule = Object.fromEntries(
      WEEKDAY_KEYS.map((k) => [k, parseDay(src[k])]),
    ) as WeekSchedule;
  }
  return { modes, showPiramide, schedule };
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: 'sheets' | 'profiles';
  speed_m_per_min: number;
  /** Multi-cavity die count (profiles only). Optional; null in older
   *  catalogs and treated as 1 by the calculator. */
  cavity: number | null;
}

/** Natural sort: "U4" < "U6" < "U10" < "U16" instead of ASCII "U10" < "U16" < "U4". */
export function sortProductsNaturally(items: CatalogProduct[]): CatalogProduct[] {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  return [...items].sort((a, b) => {
    // Keep category groups (sheets first, then profiles) and natural-sort
    // within each group.
    if (a.category !== b.category) {
      return a.category === 'sheets' ? -1 : 1;
    }
    return collator.compare(a.name, b.name);
  });
}

// URL-only: the catalog is loaded only when ?company=<slug> is present in
// the URL. Nothing is persisted in LocalStorage, so the default link
// (calc.app/) is always a clean calculator. Companies share their full
// `?company=...` link with their employees as a bookmark.
export function readSlugFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('company');
}

export async function fetchCompanyBySlug(slug: string): Promise<Company | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('companies')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[catalog] fetchCompanyBySlug failed', error);
    return null;
  }
  return data;
}

export async function fetchProductsForCompany(
  companyId: string,
): Promise<CatalogProduct[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, speed_m_per_min, cavity')
    .eq('company_id', companyId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[catalog] fetchProductsForCompany failed', error);
    return [];
  }
  // Sort client-side with natural ordering (U4 < U10) — PostgreSQL's ORDER BY
  // would do plain lexicographic sort which puts U10 before U4.
  return sortProductsNaturally((data ?? []) as CatalogProduct[]);
}

export async function fetchCompanySettings(
  companyId: string,
): Promise<CompanySettings> {
  if (!supabase) return { ...DEFAULT_COMPANY_SETTINGS };
  const { data, error } = await supabase
    .from('company_settings')
    .select('settings')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) {
    console.error('[catalog] fetchCompanySettings failed', error);
    return { ...DEFAULT_COMPANY_SETTINGS };
  }
  if (!data) return { ...DEFAULT_COMPANY_SETTINGS };
  return normalizeCompanySettings((data as { settings: unknown }).settings);
}

export async function saveCompanySettings(
  companyId: string,
  settings: CompanySettings,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase non disponibile' };
  const { error } = await supabase
    .from('company_settings')
    .upsert(
      { company_id: companyId, settings },
      { onConflict: 'company_id' },
    );
  return { error: error ? error.message : null };
}
