import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { CatalogProduct } from '../lib/catalog';

type Draft = {
  id?: string;
  name: string;
  category: 'sheets' | 'profiles';
  speed_m_per_min: string; // input string for the form, parse on submit
};

const emptyDraft: Draft = {
  name: '',
  category: 'sheets',
  speed_m_per_min: '',
};

function AdminPage() {
  'use no memo';
  const { user, companyId, loading: authLoading, signOut } = useAuth();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('products')
      .select('id, name, category, speed_m_per_min')
      .eq('company_id', companyId)
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (err) setError(err.message);
    setProducts((data as CatalogProduct[] | null) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (companyId) void reload();
  }, [companyId, reload]);

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
    const payload = {
      name: draft.name.trim(),
      category: draft.category,
      speed_m_per_min: speed,
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
            <h1 className="text-base font-semibold text-ink sm:text-lg">
              Admin · Listino prodotti
            </h1>
            <p className="truncate text-xs text-ink-soft">
              {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
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
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
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
                  step="0.1"
                  inputMode="decimal"
                  required
                  value={draft.speed_m_per_min}
                  onChange={(e) =>
                    setDraft({ ...draft, speed_m_per_min: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </div>
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
