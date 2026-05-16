import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  consumeUrlSlug,
  fetchCompanyBySlug,
  fetchProductsForCompany,
  readStoredSlug,
  writeStoredSlug,
  type CatalogProduct,
  type Company,
} from '../lib/catalog';

interface CatalogState {
  company: Company | null;
  products: CatalogProduct[];
  loading: boolean;
  /** True when a slug exists but the lookup failed (bad slug, offline, etc.). */
  error: string | null;
  /** Clears the stored slug and resets to "stand-alone" mode. */
  clear: () => void;
}

const CatalogCtx = createContext<CatalogState>({
  company: null,
  products: [],
  loading: false,
  error: null,
  clear: () => {},
});

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Pull slug from URL once (persists it in LocalStorage), or fall back to
    // whatever the user previously visited with.
    const slug = consumeUrlSlug() ?? readStoredSlug();
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

  const clear = useCallback(() => {
    writeStoredSlug(null);
    setCompany(null);
    setProducts([]);
    setError(null);
  }, []);

  const value = useMemo<CatalogState>(
    () => ({ company, products, loading, error, clear }),
    [company, products, loading, error, clear],
  );

  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
}

export function useCatalog(): CatalogState {
  return useContext(CatalogCtx);
}
