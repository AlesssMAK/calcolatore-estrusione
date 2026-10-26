import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
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
import {
  AdminModal,
  Field,
  ModalActions,
  RowActions,
} from '../components/admin/adminUi';
import { adminInputCls } from '../components/admin/adminStyles';
import {
  CalcIcon,
  CheckIcon,
  CopyIcon,
  LogoutIcon,
  SettingsIcon,
} from '../components/ActionIcons';
import { toolBtnCls, toolIconCls } from '../components/toolButton';

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

  const editProduct = (p: CatalogProduct) =>
    setDraft({
      id: p.id,
      name: p.name,
      category: p.category,
      speed_m_per_min: String(p.speed_m_per_min),
      cavity: p.cavity != null ? String(p.cavity) : '',
    });
  const categoryLabel = (p: CatalogProduct) =>
    p.category === 'sheets' ? 'Lastre' : 'Profili';

  return (
    <div className="min-h-full bg-surface-alt">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-ink sm:text-lg">
              Admin{company ? ` · ${company.name}` : ' · Listino prodotti'}
            </h1>
            <p className="truncate text-xs text-ink-soft">{user?.email}</p>
          </div>
          {/* Phones: icons only; sm+: icon + label. */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGlobal(true)}
              aria-label="Impostazioni"
              title="Impostazioni"
              className={toolBtnCls()}
            >
              <SettingsIcon className={toolIconCls} />
              <span className="hidden sm:inline">Impostazioni</span>
            </button>
            {/* A full page load, not a router <Link>: the catalog reads
                ?company= only when the app loads, so an in-app jump from /admin
                would open the clean calculator — and the load also picks up the
                products / settings just edited here. */}
            <a
              href={calcHref}
              aria-label={company ? `Calcolatore ${company.name}` : 'Calcolatore'}
              title={company ? `Calcolatore ${company.name}` : 'Calcolatore'}
              className={toolBtnCls()}
            >
              <CalcIcon className={toolIconCls} />
              <span className="hidden sm:inline">Calcolatore</span>
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Esci"
              title="Esci"
              className={`${toolBtnCls()} hover:border-danger hover:text-danger`}
            >
              <LogoutIcon className={toolIconCls} />
              <span className="hidden sm:inline">Esci</span>
            </button>
          </div>
        </div>
        {company && (
          <div className="border-t border-neutral-200 bg-neutral-50">
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
              <span className="hidden shrink-0 text-xs font-medium text-ink-soft sm:inline">
                Link calcolatore:
              </span>
              <input
                readOnly
                value={calcUrl}
                aria-label="Link calcolatore"
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs text-ink shadow-sm sm:h-9"
              />
              <button
                type="button"
                onClick={() => void copyCalcUrl()}
                aria-label={copied ? 'Copiato' : 'Copia'}
                title={copied ? 'Copiato' : 'Copia'}
                className={toolBtnCls()}
              >
                {copied ? (
                  <CheckIcon className={`${toolIconCls} text-success`} />
                ) : (
                  <CopyIcon className={toolIconCls} />
                )}
                <span className="hidden sm:inline">{copied ? 'Copiato' : 'Copia'}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-8">
        {isSuper && (
          // Same segmented control as the calculator's Lastre / Profili tabs.
          <div className="mb-4 inline-flex rounded-lg border border-neutral-200 bg-white p-1 shadow-sm sm:mb-5">
            {(
              [
                ['products', 'Prodotti'],
                ['companies', 'Aziende'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={
                  tab === key
                    ? 'rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition sm:px-4'
                    : 'rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-neutral-100 sm:px-4'
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'companies' ? (
          <CompaniesTab />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
              <h2 className="text-base font-semibold text-ink sm:text-lg">
                Prodotti ({products.length})
              </h2>
              <button
                type="button"
                onClick={() => setDraft({ ...emptyDraft })}
                aria-label="Aggiungi Prodotto"
                title="Aggiungi Prodotto"
                className={toolBtnCls(true)}
              >
                <span aria-hidden className="text-base leading-none">+</span>
                <span className="hidden sm:inline">Aggiungi Prodotto</span>
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
                Nessun prodotto. Tocca «+» per aggiungerne uno.
              </p>
            ) : (
              <>
                {/* Phones: one card per product. */}
                <ul className="space-y-2 sm:hidden">
                  {products.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {categoryLabel(p)} ·{' '}
                          <span className="font-semibold text-brand-700">
                            {p.speed_m_per_min} m/min
                          </span>
                          {p.cavity != null && <> · Cavità {p.cavity}</>}
                        </p>
                      </div>
                      <RowActions
                        onEdit={() => editProduct(p)}
                        onDelete={() => void onDelete(p)}
                      />
                    </li>
                  ))}
                </ul>
                {/* sm+: a table. */}
                <div className="hidden overflow-x-auto rounded-md border border-neutral-200 bg-white sm:block">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
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
                          <td className="px-3 py-2 text-ink-soft">{categoryLabel(p)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-brand-700">
                            {p.speed_m_per_min}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-soft">
                            {p.cavity ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            <RowActions
                              onEdit={() => editProduct(p)}
                              onDelete={() => void onDelete(p)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {draft && (
        <AdminModal onClose={() => setDraft(null)}>
          <form onSubmit={onSubmit}>
            <h3 className="text-base font-semibold text-ink sm:text-lg">
              {draft.id ? 'Modifica Prodotto' : 'Nuovo Prodotto'}
            </h3>

            <div className="mt-4 space-y-3">
              <Field label="Nome">
                <input
                  type="text"
                  autoFocus
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={adminInputCls}
                />
              </Field>

              <Field label="Categoria">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as Draft['category'],
                    })
                  }
                  className={adminInputCls}
                >
                  <option value="sheets">Lastre</option>
                  <option value="profiles">Profili</option>
                </select>
              </Field>

              <Field label="Velocità (m/min)">
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
                  className={adminInputCls}
                />
              </Field>

              {draft.category === 'profiles' && (
                <Field
                  label={
                    <>
                      Cavità{' '}
                      <span className="ml-1 normal-case text-ink-soft">(opz.)</span>
                    </>
                  }
                  hint="Numero di profili estrusi simultaneamente. Lascia vuoto se 1."
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="1"
                    value={draft.cavity}
                    onChange={(e) => setDraft({ ...draft, cavity: e.target.value })}
                    className={adminInputCls}
                  />
                </Field>
              )}
            </div>

            <ModalActions
              onCancel={() => setDraft(null)}
              busy={saving}
              primary={saving ? 'Salvando…' : draft.id ? 'Salva' : 'Crea'}
            />
          </form>
        </AdminModal>
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
