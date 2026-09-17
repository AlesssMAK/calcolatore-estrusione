import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  loadPiramideHistory,
  removePiramideEntry,
  type SavedPiramide,
} from '../../lib/piramideHistory';

interface Props {
  /** Called when a saved layout is picked; parent refills inputs + recomputes. */
  onRestore: (entry: SavedPiramide) => void;
  /** Bump from the parent after a fresh save so the list re-reads. */
  refreshKey?: number;
}

/** Relative time ("3h fa") in the current language, degrading gracefully. */
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

/** "Salvati" dropdown for Piramide layouts: restore or delete saved layouts
 *  (auto-saved on each compute). Mirrors the calculator's SavedCalculationsButton. */
function SavedPiramideButton({ onRestore, refreshKey }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedPiramide[]>(() =>
    loadPiramideHistory(),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(loadPiramideHistory());
  }, [open, refreshKey]);

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
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
          aria-label={t('piramide.saved.title')}
          className="absolute left-0 z-30 mt-2 max-h-[60vh] w-[min(20rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div className="border-b border-neutral-100 px-2 pb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            {t('piramide.saved.title')}
          </div>

          {count === 0 ? (
            <div className="px-2 py-3 text-sm text-ink-soft">
              {t('piramide.saved.empty')}
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
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {it.label}
                    </span>
                    <span className="text-[11px] text-ink-soft">
                      {formatRelative(it.ts, lang)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removePiramideEntry(it.id);
                      setItems(loadPiramideHistory());
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
        </div>
      )}
    </div>
  );
}

export default SavedPiramideButton;
