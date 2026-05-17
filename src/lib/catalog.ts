import { supabase } from './supabase';

export interface Company {
  id: string;
  slug: string;
  name: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: 'sheets' | 'profiles';
  speed_m_per_min: number;
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
    .select('id, name, category, speed_m_per_min')
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
