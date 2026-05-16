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
  notes: string | null;
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
    .select('id, name, category, speed_m_per_min, notes')
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[catalog] fetchProductsForCompany failed', error);
    return [];
  }
  return (data ?? []) as CatalogProduct[];
}
