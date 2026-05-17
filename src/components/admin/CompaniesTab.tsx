import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

interface CompanyRow {
  id: string;
  slug: string;
  name: string;
  adminEmail: string | null;
  productCount: number;
}

type CreateDraft = {
  slug: string;
  name: string;
  email: string;
  password: string;
};

type EditDraft = {
  id: string;
  slug: string;
  name: string;
};

const emptyCreate: CreateDraft = { slug: '', name: '', email: '', password: '' };

async function callFn<T = unknown>(
  name: 'create-company' | 'delete-company' | 'update-company',
  body: Record<string, unknown>,
): Promise<{ data?: T; error?: string }> {
  if (!supabase) return { error: 'Supabase non configurato' };
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    // supabase wraps non-2xx as FunctionsHttpError — try to extract body
    interface MaybeErr { context?: { error?: string; message?: string } }
    const maybeBody = (error as unknown as MaybeErr).context;
    const msg =
      (data as unknown as { error?: string } | undefined)?.error ??
      maybeBody?.error ??
      maybeBody?.message ??
      error.message;
    return { error: msg };
  }
  return { data: data ?? undefined };
}

function CompaniesTab() {
  'use no memo';
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    // Companies
    const { data: companies, error: cErr } = await supabase
      .from('companies')
      .select('id, slug, name')
      .order('name', { ascending: true });
    if (cErr) {
      setError(cErr.message);
      setLoading(false);
      return;
    }
    // Admins (user_id, company_id) — super RLS sees all
    const { data: admins } = await supabase
      .from('admins')
      .select('user_id, company_id');
    // Auth.users emails — only super-admin can read via a helper view? We can't
    // directly read auth.users from frontend. Skip email lookup for now and
    // show only the count of admins per company.
    const adminCountByCompany = new Map<string, number>();
    (admins ?? []).forEach((a) => {
      adminCountByCompany.set(
        a.company_id,
        (adminCountByCompany.get(a.company_id) ?? 0) + 1,
      );
    });
    // Product counts (single round-trip)
    const { data: productRows } = await supabase
      .from('products')
      .select('company_id');
    const productCountByCompany = new Map<string, number>();
    (productRows ?? []).forEach((p) => {
      productCountByCompany.set(
        p.company_id,
        (productCountByCompany.get(p.company_id) ?? 0) + 1,
      );
    });

    setRows(
      (companies ?? []).map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        adminEmail:
          adminCountByCompany.get(c.id)
            ? `${adminCountByCompany.get(c.id)} admin`
            : null,
        productCount: productCountByCompany.get(c.id) ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createDraft) return;
    setBusy(true);
    setError(null);
    const { error: err } = await callFn('create-company', createDraft);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setCreateDraft(null);
    await reload();
  };

  const onEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;
    setBusy(true);
    setError(null);
    const { error: err } = await callFn('update-company', {
      company_id: editDraft.id,
      slug: editDraft.slug,
      name: editDraft.name,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setEditDraft(null);
    await reload();
  };

  const onDelete = async (row: CompanyRow) => {
    const msg =
      `Eliminerà l'azienda "${row.name}" insieme a ${row.productCount} prodotti ` +
      `e tutti gli admin associati. Procedere?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const { error: err } = await callFn('delete-company', {
      company_id: row.id,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    await reload();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink sm:text-lg">
          Aziende ({rows.length})
        </h2>
        <button
          type="button"
          onClick={() => setCreateDraft({ ...emptyCreate })}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          + Nuova azienda
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          ⚠ {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink-soft">Caricamento…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-ink-soft">
          Nessuna azienda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2 text-right">Prodotti</th>
                <th className="px-3 py-2 text-right">Admin</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-neutral-100 last:border-b-0"
                >
                  <td className="px-3 py-2 font-medium text-ink">{r.name}</td>
                  <td className="px-3 py-2 text-ink-soft">
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                      {r.slug}
                    </code>
                  </td>
                  <td className="px-3 py-2 text-right">{r.productCount}</td>
                  <td className="px-3 py-2 text-right text-ink-soft">
                    {r.adminEmail ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditDraft({
                            id: r.id,
                            slug: r.slug,
                            name: r.name,
                          })
                        }
                        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-500 hover:text-brand-700"
                      >
                        ✎ Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(r)}
                        disabled={busy}
                        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-danger hover:text-danger disabled:opacity-60"
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

      {createDraft && (
        <Modal onClose={() => setCreateDraft(null)}>
          <form onSubmit={onCreate}>
            <h3 className="text-base font-semibold text-ink sm:text-lg">
              Nuova azienda
            </h3>
            <p className="mt-1 text-xs text-ink-soft">
              Verrà creata l'azienda + l'utente admin (email + password) +
              il collegamento, in un'unica operazione.
            </p>

            <div className="mt-4 space-y-3">
              <Field label="Nome">
                <input
                  type="text"
                  required
                  autoFocus
                  value={createDraft.name}
                  onChange={(e) =>
                    setCreateDraft({ ...createDraft, name: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>

              <Field
                label="Slug (URL)"
                hint="solo lettere minuscole, cifre, trattini (es. bianca-plast)"
              >
                <input
                  type="text"
                  required
                  pattern="[a-z0-9-]+"
                  value={createDraft.slug}
                  onChange={(e) =>
                    setCreateDraft({
                      ...createDraft,
                      slug: e.target.value.toLowerCase(),
                    })
                  }
                  className={`${inputCls} font-mono`}
                />
              </Field>

              <Field label="Email admin">
                <input
                  type="email"
                  required
                  value={createDraft.email}
                  onChange={(e) =>
                    setCreateDraft({ ...createDraft, email: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>

              <Field
                label="Password admin"
                hint="almeno 8 caratteri, condividila col cliente in modo sicuro"
              >
                <input
                  type="text"
                  required
                  minLength={8}
                  value={createDraft.password}
                  onChange={(e) =>
                    setCreateDraft({
                      ...createDraft,
                      password: e.target.value,
                    })
                  }
                  className={`${inputCls} font-mono`}
                />
              </Field>
            </div>

            <Actions
              onCancel={() => setCreateDraft(null)}
              busy={busy}
              primary={busy ? 'Creando…' : 'Crea azienda'}
            />
          </form>
        </Modal>
      )}

      {editDraft && (
        <Modal onClose={() => setEditDraft(null)}>
          <form onSubmit={onEdit}>
            <h3 className="text-base font-semibold text-ink sm:text-lg">
              Modifica azienda
            </h3>
            <div className="mt-4 space-y-3">
              <Field label="Nome">
                <input
                  type="text"
                  required
                  autoFocus
                  value={editDraft.name}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, name: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
              <Field
                label="Slug"
                hint="cambiare lo slug rompe i link salvati dai clienti"
              >
                <input
                  type="text"
                  required
                  pattern="[a-z0-9-]+"
                  value={editDraft.slug}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      slug: e.target.value.toLowerCase(),
                    })
                  }
                  className={`${inputCls} font-mono`}
                />
              </Field>
            </div>
            <Actions
              onCancel={() => setEditDraft(null)}
              busy={busy}
              primary={busy ? 'Salvando…' : 'Salva'}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-ink-soft">{hint}</p>}
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl sm:p-6">
        {children}
      </div>
    </div>
  );
}

function Actions({
  onCancel,
  busy,
  primary,
}: {
  onCancel: () => void;
  busy: boolean;
  primary: string;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand-500"
      >
        Annulla
      </button>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {primary}
      </button>
    </div>
  );
}

export default CompaniesTab;
