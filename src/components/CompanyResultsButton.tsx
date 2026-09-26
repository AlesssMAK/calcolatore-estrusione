import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../contexts/CatalogContext';
import { fetchCompanyCalcs, type CompanyCalc } from '../lib/sharedCalc';

interface Props {
  /** Open a company-published result (parent restores it as a synced doc). */
  onOpen: (calc: CompanyCalc) => void;
  /** Bump to re-read the list (after a publish/unpublish). */
  refreshKey?: number;
}

function formatRelative(ts: number, lang: string): string {
  const minutes = Math.round((Date.now() - ts) / 60_000);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
    return rtf.format(-Math.round(hours / 24), 'day');
  } catch {
    return new Date(ts).toLocaleString(lang);
  }
}

/** Dropdown of the calculations the active company has published to its shared
 *  list. Visible only when a company is active. Opening one restores it as a
 *  live (followed / editable) document. */
function CompanyResultsButton({ onOpen, refreshKey = 0 }: Props) {
  const { t, i18n } = useTranslation();
  const { company } = useCatalog();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CompanyCalc[]>([]);
  const [count, setCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const lang = i18n.resolvedLanguage ?? 'it';

  // Keep the badge count fresh (also when closed) so members notice new results.
  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    void fetchCompanyCalcs(company.slug).then((list) => {
      if (!cancelled) setCount(list.length);
    });
    return () => {
      cancelled = true;
    };
  }, [company, refreshKey]);

  useEffect(() => {
    if (!open || !company) return;
    void fetchCompanyCalcs(company.slug).then((list) => {
      setItems(list);
      setCount(list.length);
    });
  }, [open, company, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!company) return null;

  return (
    <div ref={rootRef} className="relative order-3 w-full sm:order-0 sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 sm:w-auto"
      >
        <span aria-hidden>🏢</span>
        <span>{t('company.results')}</span>
        {count > 0 && (
          <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('company.results')}
          className="absolute right-0 z-30 mt-2 max-h-[60vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div className="border-b border-neutral-100 px-2 pb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            {t('company.results')}
          </div>
          {items.length === 0 ? (
            <div className="px-2 py-3 text-sm text-ink-soft">
              {t('company.empty')}
            </div>
          ) : (
            <ul className="my-1 flex flex-col gap-0.5">
              {items.map((c) => {
                const now = Date.now();
                const inProduction =
                  c.payload.result?.startAt instanceof Date &&
                  c.payload.result?.endAt instanceof Date &&
                  c.payload.result.startAt.getTime() <= now &&
                  now < c.payload.result.endAt.getTime();
                const ts = c.updatedAt ? new Date(c.updatedAt).getTime() : now;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        onOpen(c);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition hover:bg-brand-50"
                    >
                      <span className="flex w-full items-center gap-1.5">
                        {inProduction && (
                          <span
                            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {c.payload.label || '—'}
                        </span>
                        {c.isEditable && (
                          <span
                            className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700"
                            title={t('company.editable')}
                          >
                            ✎
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-ink-soft">
                        {formatRelative(ts, lang)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default CompanyResultsButton;
