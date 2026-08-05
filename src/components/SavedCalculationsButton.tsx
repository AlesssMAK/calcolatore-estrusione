import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  loadHistory,
  removeCalculation,
  type SavedCalculation,
} from '../lib/calcHistory';
import { useCatalog } from '../contexts/CatalogContext';

interface Props {
  /** Called when the user picks a saved calculation; parent refills the form
   *  with its inputs and shows the result below. */
  onRestore: (entry: SavedCalculation) => void;
  /** Bump from the parent to force the dropdown to re-read history after a
   *  fresh save — avoids stale lists when the dropdown is reopened. */
  refreshKey?: number;
}

/** Relative time formatter that prefers the current i18n language. Falls
 *  back to a simple "now" when Intl.RelativeTimeFormat is unavailable. */
function formatRelative(ts: number, lang: string): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60_000);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    return rtf.format(-days, 'day');
  } catch {
    return new Date(ts).toLocaleString(lang);
  }
}

function SavedCalculationsButton({ onRestore, refreshKey = 0 }: Props) {
  const { t, i18n } = useTranslation();
  const { settings } = useCatalog();
  const retentionDays = settings.savedRetentionDays;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedCalculation[]>(() =>
    loadHistory(retentionDays),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  // Refresh whenever the dropdown opens, or the parent bumps the key after a
  // fresh save. Keeps the list in sync without prop-drilling the whole array.
  useEffect(() => {
    if (open) setItems(loadHistory(retentionDays));
  }, [open, refreshKey, retentionDays]);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = items.length;
  const lang = i18n.resolvedLanguage ?? 'it';

  return (
    <div ref={rootRef} className="relative order-3 w-full sm:order-0 sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 sm:w-auto"
      >
        <span aria-hidden>💾</span>
        <span>{t('actions.saved')}</span>
        {count > 0 && (
          <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('saved.title')}
          className="absolute right-0 z-30 mt-2 max-h-[60vh] w-[min(20rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div className="border-b border-neutral-100 px-2 pb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            {t('saved.title')}
          </div>

          {count === 0 ? (
            <div className="px-2 py-3 text-sm text-ink-soft">
              {t('saved.empty')}
            </div>
          ) : (
            <ul className="my-1 flex flex-col gap-0.5">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-1 rounded-md hover:bg-neutral-50"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onRestore(it);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-2 text-left"
                    title={t('saved.restore')}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                        {it.label}
                      </span>
                      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                        {t(`tabs.${it.result.mode}`)}
                      </span>
                    </span>
                    <span className="text-[11px] text-ink-soft">
                      {formatRelative(it.ts, lang)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeCalculation(it.id, retentionDays);
                      setItems(loadHistory(retentionDays));
                    }}
                    aria-label={t('saved.delete')}
                    title={t('saved.delete')}
                    className="mr-1 shrink-0 rounded p-1.5 text-ink-soft transition hover:bg-danger/10 hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-neutral-100 px-2 pt-2 text-[11px] text-ink-soft">
            {t('saved.hint')}
          </div>
        </div>
      )}
    </div>
  );
}

export default SavedCalculationsButton;
