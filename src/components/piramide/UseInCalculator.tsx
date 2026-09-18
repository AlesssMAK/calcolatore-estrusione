import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { loadHistory } from '../../lib/calcHistory';

interface CalcOption {
  id: string;
  label: string;
  ts: number;
}

interface Props {
  /** Start a fresh calculation with the Piramide order. */
  onNew: () => void;
  /** Append the Piramide order to an existing saved calculation. */
  onExisting: (calcId: string) => void;
  /** No non-empty sheet rows yet → nothing to hand off. */
  disabled: boolean;
  t: TFunction;
  retentionDays?: number;
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

// Any sheets-mode saved calc can receive an extra order (unlike the import
// direction, we don't require the calc to already carry importable sizes).
function loadSheetsCalcs(retentionDays?: number): CalcOption[] {
  return loadHistory(retentionDays)
    .filter((e) => e.result?.mode === 'sheets')
    .map((e) => ({ id: e.id, label: e.label, ts: e.ts }));
}

/** Dropdown that sends the Piramide sheet list into the calculator as an order:
 *  either a brand-new calculation or appended to an existing saved one. Mirror
 *  of the "Apri in Piramide" / import direction. */
function UseInCalculator({ onNew, onExisting, disabled, t, retentionDays }: Props) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [calcs, setCalcs] = useState<CalcOption[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const lang = i18n.resolvedLanguage ?? 'it';

  useEffect(() => {
    if (open) setCalcs(loadSheetsCalcs(retentionDays));
  }, [open, retentionDays]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden>🧮</span>
        <span>{t('piramide.useInCalculator.button')}</span>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-brand-50"
          >
            <span aria-hidden>➕</span>
            <span>{t('piramide.useInCalculator.new')}</span>
          </button>

          <div className="mt-1 border-t border-neutral-100 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
            {t('piramide.useInCalculator.existing')}
          </div>
          {calcs.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-soft">
              {t('piramide.useInCalculator.emptySaved')}
            </p>
          ) : (
            calcs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onExisting(c.id);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-brand-50"
              >
                <span className="block truncate text-sm font-medium text-ink">
                  {c.label}
                </span>
                <span className="block text-xs text-ink-soft">
                  {formatRelative(c.ts, lang)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default UseInCalculator;
