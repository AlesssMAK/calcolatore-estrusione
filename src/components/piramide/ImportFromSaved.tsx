import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { loadHistory } from '../../lib/calcHistory';

export interface ImportRow {
  length: number;
  qty: number;
}

interface ImportOrder {
  label: string;
  sizes: number;
  pieces: number;
  rows: ImportRow[];
}

interface CalcGroup {
  id: string;
  label: string;
  ts: number;
  orders: ImportOrder[];
}

interface Props {
  /** Called with an order's sheet rows when the user picks one. */
  onImport: (rows: ImportRow[]) => void;
  t: TFunction;
  /** Company retention window (matches the Salvati dropdown). */
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

// Group saved calculations → their importable orders: sheets-mode orders that
// carry per-size length+qty pairs (Σ Metri totali and profiles orders have no
// lastre measures, so they're skipped). Calcs with no importable order drop out.
function buildGroups(retentionDays?: number): CalcGroup[] {
  const out: CalcGroup[] = [];
  for (const entry of loadHistory(retentionDays)) {
    if (entry.result?.mode !== 'sheets') continue;
    const orders = (entry.values?.orders ?? [])
      .map((o, i): ImportOrder | null => {
        if (o.useTotalLength) return null;
        const rows = (o.sizes ?? [])
          .map((s) => ({ length: Number(s?.length), qty: Number(s?.sheets) }))
          .filter((r) => r.length > 0 && r.qty > 0);
        if (!rows.length) return null;
        return {
          label: o.productName?.trim() || `#${i + 1}`,
          sizes: rows.length,
          pieces: rows.reduce((a, r) => a + r.qty, 0),
          rows,
        };
      })
      .filter((x): x is ImportOrder => x !== null);
    if (orders.length) {
      out.push({ id: entry.id, label: entry.label, ts: entry.ts, orders });
    }
  }
  return out;
}

/** Two-level dropdown that imports an order's sheet sizes from a saved
 *  calculation into the Piramide sheet list — pick a calculation, then the
 *  order within it. The "come to Piramide fresh and pull an order" entry point
 *  (the calculator's per-order button is the live-handoff twin). */
function ImportFromSaved({ onImport, t, retentionDays }: Props) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<CalcGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const lang = i18n.resolvedLanguage ?? 'it';

  // Re-read the history each time the panel opens (fresh saves show up); always
  // start at the calc list.
  useEffect(() => {
    if (open) {
      setGroups(buildGroups(retentionDays));
      setSelectedId(null);
    }
  }, [open, retentionDays]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
      >
        <span aria-hidden>📥</span>
        <span>{t('piramide.import.button')}</span>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-[min(18rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
          {groups.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-soft">
              {t('piramide.import.empty')}
            </p>
          ) : selected === null ? (
            // Level 1 — saved calculations.
            groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedId(g.id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition hover:bg-brand-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {g.label}
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {t('piramide.import.orders', { n: g.orders.length })} ·{' '}
                    {formatRelative(g.ts, lang)}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-ink-soft">
                  ›
                </span>
              </button>
            ))
          ) : (
            // Level 2 — orders inside the chosen calculation.
            <>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mb-1 flex w-full items-center gap-1 rounded-md px-3 py-2 text-left text-xs font-medium text-ink-soft transition hover:bg-neutral-50"
              >
                <span aria-hidden>‹</span>
                <span className="truncate">{selected.label}</span>
              </button>
              {selected.orders.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onImport(o.rows);
                    setOpen(false);
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-brand-50"
                >
                  <span className="block truncate text-sm font-medium text-ink">
                    {o.label}
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {t('piramide.import.info', { sizes: o.sizes, pieces: o.pieces })}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ImportFromSaved;
