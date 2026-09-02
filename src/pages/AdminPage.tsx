import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { companyUrl } from '../lib/appUrl';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_COMPANY_SETTINGS,
  fetchCompanySettings,
  sortProductsNaturally,
  type CatalogProduct,
  type CompanySettings,
} from '../lib/catalog';
import CompaniesTab from '../components/admin/CompaniesTab';
import GlobalSettingsModal from '../components/admin/GlobalSettingsModal';

type AdminTab = 'products' | 'companies';

type Draft = {
  id?: string;
  name: string;
  category: 'sheets' | 'profiles';
  speed_m_per_min: string; // input string for the form, parse on submit
  cavity: string; // optional; empty → null
};

const emptyDraft: Draft = {
  name: '',
  category: 'sheets',
  speed_m_per_min: '',
  cavity: '',
};

function AdminPage() {
  'use no memo';
  const { user, companyId, isSuper, loading: authLoading, signOut } = useAuth();
  const [tab, setTab] = useState<AdminTab>('products');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGlobal, setShowGlobal] = useState(false);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(
    DEFAULT_COMPANY_SETTINGS,
  );
  const [company, setCompany] = useState<{ slug: string; name: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('products')
      .select('id, name, category, speed_m_per_min, cavity')
      .eq('company_id', companyId);
    if (err) setError(err.message);
    setProducts(sortProductsNaturally((data as CatalogProduct[] | null) ?? []));
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (companyId) void reload();
  }, [companyId, reload]);

  useEffect(() => {
    if (companyId) void fetchCompanySettings(companyId).then(setCompanySettings);
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !supabase) return;
    void supabase
      .from('companies')
      .select('slug, name')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data }) =>
        setCompany((data as { slug: string; name: string } | null) ?? null),
      );
  }, [companyId]);

  const calcHref = company ? `/?company=${encodeURIComponent(company.slug)}` : '/';
  // Always build the shareable link on the canonical production domain, so a
  // link copied from the admin points there even when the panel is opened on a
  // preview / localhost / old domain.
  const calcUrl = companyUrl(company?.slug);
  const copyCalcUrl = async () => {
    try {
      await navigator.clipboard.writeText(calcUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  // Redirect / authorization gates
  if (!authLoading && !user) return <Navigate to="/admin/login" replace />;
  if (!authLoading && user && companyId === null) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Accesso negato</h1>
        <p className="mt-2 text-sm text-ink-soft">
          L'utente <strong>{user.email}</strong> non è associato a nessuna
          azienda. Contatta l'amministratore di sistema.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand-500"
        >
          Esci
        </button>
      </Centered>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !supabase || !companyId) return;
    setSaving(true);
    setError(null);
    const speed = Number(draft.speed_m_per_min.replace(',', '.'));
    if (!Number.isFinite(speed) || speed <= 0) {
      setError('Velocità non valida');
      setSaving(false);
      return;
    }
    if (!draft.name.trim()) {
      setError('Nome non può essere vuoto');
      setSaving(false);
      return;
    }
    // Cavity is optional. Empty → null (catalog entry has no cavity, so the
    // calculator treats it as 1). Profiles-only by UI; for sheets we strip it.
    let cavityValue: number | null = null;
    if (draft.category === 'profiles' && draft.cavity.trim() !== '') {
      const c = Number(draft.cavity.replace(',', '.'));
      if (!Number.isInteger(c) || c <= 0) {
        setError('Cavità deve essere un intero > 0');
        setSaving(false);
        return;
      }
      cavityValue = c;
    }
    const payload = {
      name: draft.name.trim(),
      category: draft.category,
      speed_m_per_min: speed,
      cavity: cavityValue,
      company_id: companyId,
    };
    const op = draft.id
      ? supabase.from('products').update(payload).eq('id', draft.id)
      : supabase.from('products').insert(payload);
    const { error: err } = await op;
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft(null);
    await reload();
  };

  const onDelete = async (p: CatalogProduct) => {
    if (!supabase) return;
    if (!window.confirm(`Eliminare "${p.name}"?`)) return;
    const { error: err } = await supabase
      .from('products')
      .delete()
      .eq('id', p.id);
    if (err) setError(err.message);
    else await reload();
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:py-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-ink sm:text-lg">
              Admin{company ? ` · ${company.name}` : ' · Listino prodotti'}
            </h1>
            <p className="truncate text-xs text-ink-soft">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGlobal(true)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand-500 sm:text-sm"
            >
              ⚙ Impostazioni
            </button>
            <Link
              to={calcHref}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand-500 sm:text-sm"
            >
              Calcolatore
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-danger hover:text-danger sm:text-sm"
            >
              Esci
            </button>
          </div>
        </div>
        {company && (
          <div className="border-t border-neutral-200 bg-neutral-50">
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
              <span className="shrink-0 text-xs font-medium text-ink-soft">
                Link calcolatore:
              </span>
              <input
                readOnly
                value={calcUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-ink"
              />
              <button
                type="button"
                onClick={() => void copyCalcUrl()}
                className="shrink-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-ink hover:border-brand-500"
              >
                {copied ? '✓ Copiato' : '📋 Copia'}
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {isSuper && (
          <div className="mb-5 inline-flex rounded-md border border-neutral-300 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab('products')}
              className={
                tab === 'products'
                  ? 'rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink'
              }
            >
              Prodotti
            </button>
            <button
              type="button"
              onClick={() => setTab('companies')}
              className={
                tab === 'companies'
                  ? 'rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink'
              }
            >
              Aziende
            </button>
          </div>
        )}

        {tab === 'companies' ? (
          <CompaniesTab />
        ) : (
          <>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink sm:text-lg">
            Prodotti ({products.length})
          </h2>
          <button
            type="button"
            onClick={() => setDraft({ ...emptyDraft })}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            + Aggiungi prodotto
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
            ⚠ {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-ink-soft">Caricamento…</p>
        ) : products.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-ink-soft">
            Nessun prodotto. Clicca «+ Aggiungi prodotto» per iniziare.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2 text-right">m/min</th>
                  <th className="px-3 py-2 text-right">Cavità</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-ink">{p.name}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {p.category === 'sheets' ? 'Lastre' : 'Profili'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-brand-700">
                      {p.speed_m_per_min}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-soft">
                      {p.cavity ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              id: p.id,
                              name: p.name,
                              category: p.category,
                              speed_m_per_min: String(p.speed_m_per_min),
                              cavity: p.cavity != null ? String(p.cavity) : '',
                            })
                          }
                          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-500 hover:text-brand-700"
                        >
                          ✎ Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(p)}
                          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-danger hover:text-danger"
                        >
                          🗑 Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}
      </main>

      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDraft(null);
          }}
        >
          <form
            onSubmit={onSubmit}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl sm:p-6"
          >
            <h3 className="text-base font-semibold text-ink sm:text-lg">
              {draft.id ? 'Modifica prodotto' : 'Nuovo prodotto'}
            </h3>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Nome
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Categoria
                </label>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as Draft['category'],
                    })
                  }
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                >
                  <option value="sheets">Lastre</option>
                  <option value="profiles">Profili</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Velocità (m/min)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  required
                  value={draft.speed_m_per_min}
                  onChange={(e) =>
                    setDraft({ ...draft, speed_m_per_min: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </div>

              {draft.category === 'profiles' && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                    Cavità{' '}
                    <span className="ml-1 normal-case text-ink-soft">
                      (opz.)
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="1"
                    value={draft.cavity}
                    onChange={(e) =>
                      setDraft({ ...draft, cavity: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-ink-soft">
                    Numero di profili estrusi simultaneamente. Lascia vuoto
                    se 1.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand-500"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Salvando…' : draft.id ? 'Salva' : 'Crea'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showGlobal && companyId && (
        <GlobalSettingsModal
          companyId={companyId}
          subtitle={user?.email}
          initial={companySettings}
          onClose={() => setShowGlobal(false)}
          onSaved={setCompanySettings}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8 text-center">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}

export default AdminPage;
