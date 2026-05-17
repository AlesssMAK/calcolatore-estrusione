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

const STORAGE_KEY = 'calc.companySlug';

// Read/write the active company slug from LocalStorage. The slug is the only
// thing we persist locally — products themselves are always fetched fresh
// from Supabase so the user sees admin's latest edits.

export function readStoredSlug(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredSlug(slug: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (slug) window.localStorage.setItem(STORAGE_KEY, slug);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota exceeded — ignore */
  }
}

// Pull the slug from ?company=... in the URL once, persist it, and strip the
// parameter so the URL stays clean on subsequent navigation/share.
export function consumeUrlSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('company');
  if (!slug) return null;
  writeStoredSlug(slug);
  params.delete('company');
  const search = params.toString();
  const newUrl =
    window.location.pathname + (search ? `?${search}` : '') + window.location.hash;
  window.history.replaceState({}, '', newUrl);
  return slug;
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
