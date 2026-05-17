import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchCompanyBySlug,
  fetchProductsForCompany,
  readSlugFromUrl,
  type CatalogProduct,
  type Company,
} from '../lib/catalog';

interface CatalogState {
  company: Company | null;
  products: CatalogProduct[];
  loading: boolean;
  /** True when a slug exists but the lookup failed (bad slug, offline, etc.). */
  error: string | null;
}

const CatalogCtx = createContext<CatalogState>({
  company: null,
  products: [],
  loading: false,
  error: null,
});

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // One-time cleanup: earlier versions persisted the slug here. Drop it so
    // returning users don't see a "stuck" listino on the clean URL.
    try {
      window.localStorage.removeItem('calc.companySlug');
    } catch {
      /* ignore */
    }

    // URL-only: catalog appears only when ?company=<slug> is in the URL.
    // No LocalStorage — the default link stays a clean calculator.
    const slug = readSlugFromUrl();
    if (!slug) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const c = await fetchCompanyBySlug(slug);
        if (cancelled) return;
        if (!c) {
          setError(`Listino "${slug}" non trovato.`);
          setCompany(null);
          setProducts([]);
          return;
        }
        setCompany(c);
        const items = await fetchProductsForCompany(c.id);
        if (cancelled) return;
        setProducts(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CatalogState>(
    () => ({ company, products, loading, error }),
    [company, products, loading, error],
  );

  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
}

export function useCatalog(): CatalogState {
  return useContext(CatalogCtx);
}
