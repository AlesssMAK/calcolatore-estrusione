import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { loadHistory } from '../../lib/calcHistory';

export interface ImportRow {
  length: number;
  qty: number;
}

interface FlatItem {
  key: string;
  /** "CalcLabel · OrderLabel" (or just the calc label for single-order calcs). */
  label: string;
  sizes: number;
  pieces: number;
  rows: ImportRow[];
}

interface Props {
  /** Called with an order's sheet rows when the user picks one. */
  onImport: (rows: ImportRow[]) => void;
  t: TFunction;
  /** Company retention window (matches the Salvati dropdown). */
  retentionDays?: number;
}

// Flatten saved calculations into one clickable row per importable order:
// sheets-mode orders that carry per-size length+qty pairs (Σ Metri totali and
// profiles orders have no lastre measures, so they're skipped).
function buildItems(retentionDays?: number): FlatItem[] {
  const out: FlatItem[] = [];
  for (const entry of loadHistory(retentionDays)) {
    if (entry.result?.mode !== 'sheets') continue;
    const orders = entry.values?.orders ?? [];
    const importable = orders
      .map((o, i) => {
        if (o.useTotalLength) return null;
        const rows = (o.sizes ?? [])
          .map((s) => ({ length: Number(s?.length), qty: Number(s?.sheets) }))
          .filter((r) => r.length > 0 && r.qty > 0);
        if (!rows.length) return null;
        return { label: o.productName?.trim() || `#${i + 1}`, rows };
      })
      .filter((x): x is { label: string; rows: ImportRow[] } => x !== null);
    if (!importable.length) continue;
    const single = importable.length === 1;
    importable.forEach((o, i) => {
      out.push({
        key: `${entry.id}:${i}`,
        label: single ? entry.label : `${entry.label} · ${o.label}`,
        sizes: o.rows.length,
        pieces: o.rows.reduce((a, r) => a + r.qty, 0),
        rows: o.rows,
      });
    });
  }
  return out;
}

/** Dropdown that imports an order's sheet sizes from a saved calculation into
 *  the Piramide sheet list — the "come to Piramide fresh and pull an order"
 *  entry point (the calculator's per-order button is the live-handoff twin). */
function ImportFromSaved({ onImport, t, retentionDays }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FlatItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Re-read the history each time the panel opens (fresh saves show up).
  useEffect(() => {
    if (open) setItems(buildItems(retentionDays));
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
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
      >
        <span aria-hidden>📥</span>
        <span>{t('piramide.import.button')}</span>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
          {items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-soft">
              {t('piramide.import.empty')}
            </p>
          ) : (
            items.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => {
                  onImport(it.rows);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-brand-50"
              >
                <span className="block truncate text-sm font-medium text-ink">
                  {it.label}
                </span>
                <span className="block text-xs text-ink-soft">
                  {t('piramide.import.info', {
                    sizes: it.sizes,
                    pieces: it.pieces,
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ImportFromSaved;
