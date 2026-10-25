import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { CalculatorMode, Order, OrderSize } from '../types';
import { diffCalcs, type CalcDiff, type CalcVersion } from '../utils/calcDiff';
import type { DiffSide } from '../utils/calcMerge';
import { formatDuration } from '../utils/format';

interface Props {
  /** The calc's name, for the header. */
  label: string;
  mode: CalculatorMode;
  original: CalcVersion;
  production: CalcVersion;
  /** Opened from "Invia a Produzione": Produzione changed since the last send. */
  fromSend?: boolean;
  /** Make the two match for `diffs`, the `from` side's values winning:
   *  'production' changes the original, 'original' changes Produzione. */
  onSettle: (diffs: CalcDiff[], from: DiffSide) => Promise<void>;
  onClose: () => void;
}

/** "Confronta": what differs between the original (Salvati) and the version in
 *  Produzione — the plan (orders, their order, fields, sizes, settings) and,
 *  apart, the progress. Each difference can be settled either way: "Usa
 *  Originale" puts the original's value in Produzione, "Usa Produzione" takes
 *  Produzione's into the original. */
function CompareModal({
  label,
  mode,
  original,
  production,
  fromSend,
  onSettle,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const [busy, setBusy] = useState(false);
  // Compared as of the moment the window opened, so the list stays put.
  const [now] = useState(() => new Date());
  const diffs = useMemo(
    () => diffCalcs(original, production, now),
    [original, production, now],
  );
  const plan = diffs.filter((d) => d.group === 'plan');
  const progress = diffs.filter((d) => d.group === 'progress');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const settle = (list: CalcDiff[], from: DiffSide) => {
    if (busy || list.length === 0) return;
    setBusy(true);
    void onSettle(list, from).finally(() => setBusy(false));
  };

  const fmt = makeFormatter(t, lang, mode, original, production);

  // Plan differences grouped: the calc's settings, the queue, then per order.
  const groups: { key: string; title: string; items: CalcDiff[] }[] = [];
  const groupFor = (key: string, title: string) => {
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, title, items: [] };
      groups.push(g);
    }
    return g;
  };
  for (const d of plan) {
    if (d.kind === 'setting') groupFor('settings', t('compare.settings')).items.push(d);
    else if (d.kind === 'orderSequence' || d.kind === 'orderAdded' || d.kind === 'orderRemoved')
      groupFor('queue', t('compare.queue')).items.push(d);
    else groupFor(`o:${d.orderId}`, fmt.orderName(d.orderId)).items.push(d);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('compare.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden bg-surface-alt shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{t('compare.title')}</h2>
            <p className="truncate text-xs text-ink-soft">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close')}
            className="rounded p-1.5 text-ink-soft transition hover:bg-neutral-100 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
          {fromSend && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠ {t('compare.fromSend')}
            </p>
          )}
          {diffs.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-soft">{t('compare.none')}</p>
          )}
          {groups.map((g) => (
            <section key={g.key}>
              <h3
                className={
                  // An order's group: its number + name / size, as written.
                  g.key.startsWith('o:')
                    ? 'mb-1.5 text-sm font-semibold text-ink'
                    : 'mb-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase'
                }
              >
                {g.title}
              </h3>
              <ul className="space-y-2">
                {g.items.map((d, i) => (
                  <DiffCard
                    key={i}
                    title={fmt.title(d)}
                    original={fmt.value(d, 'original')}
                    production={fmt.value(d, 'production')}
                    busy={busy}
                    onUse={(from) => settle([d], from)}
                    t={t}
                  />
                ))}
              </ul>
            </section>
          ))}
          {progress.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
                {t('compare.progress')}
              </h3>
              <p className="mb-1.5 text-[11px] text-ink-soft">{t('compare.progressHint')}</p>
              <ul className="space-y-2">
                {progress.map((d, i) => (
                  <DiffCard
                    key={i}
                    title={`${fmt.orderName(d.orderId)} · ${fmt.title(d)}`}
                    original={fmt.value(d, 'original')}
                    production={fmt.value(d, 'production')}
                    busy={busy}
                    onUse={(from) => settle([d], from)}
                    t={t}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        {diffs.length > 0 && (
          // Everything at once: the original's plan into Produzione (the
          // factory's real progress stays), or all of Produzione — progress
          // included — into the original.
          <footer className="grid grid-cols-2 gap-2 border-t border-neutral-200 bg-white px-3 py-3 sm:px-4">
            <button
              type="button"
              disabled={busy || plan.length === 0}
              onClick={() => settle(plan, 'original')}
              className="rounded-md border border-brand-300 bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              {t('compare.allOriginal')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => settle(diffs, 'production')}
              className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              {t('compare.allProduction')}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

// One difference: what it is, both values side by side, and under each the
// button that makes it win.
function DiffCard({
  title,
  original,
  production,
  busy,
  onUse,
  t,
}: {
  title: string;
  original: string;
  production: string;
  busy: boolean;
  onUse: (from: DiffSide) => void;
  t: TFunction;
}) {
  const side = (heading: string, value: string, from: DiffSide, useLabel: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="min-w-0 flex-1 rounded-md bg-neutral-50 px-2 py-1.5">
        <span className="block text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
          {heading}
        </span>
        <span className="block text-sm font-medium break-words text-ink">{value}</span>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onUse(from)}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-wait disabled:opacity-50"
      >
        {useLabel}
      </button>
    </div>
  );
  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm">
      <p className="mb-2 text-sm font-medium text-ink">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {side(t('compare.original'), original, 'original', t('compare.useOriginal'))}
        {side(t('compare.production'), production, 'production', t('compare.useProduction'))}
      </div>
    </li>
  );
}

// Words for the differences: titles and the two values, from either version.
function makeFormatter(
  t: TFunction,
  lang: string,
  mode: CalculatorMode,
  original: CalcVersion,
  production: CalcVersion,
) {
  const profiles = mode === 'profiles';
  const units = { day: t('units.day'), hour: t('units.hour'), minute: t('units.minute') };
  const ordersOf = (v: CalcVersion): Order[] => [
    ...(v.completedRows ?? []).map((r) => r.order),
    ...(v.values.orders as Order[]),
  ];
  const all = [...ordersOf(original), ...ordersOf(production)];
  const findOrder = (id: string) => all.find((o) => o.id === id);
  // An order is called by its number in the original's queue ("#2"), plus its
  // product name — or, without one, its first size — so it can be recognised.
  const tag = (id: string) => {
    const i = original.values.orders.findIndex((o) => o.id === id);
    if (i >= 0) return `#${i + 1}`;
    return production.values.orders.some((o) => o.id === id)
      ? t('compare.newOrder')
      : t('compare.doneOrder');
  };
  const sizeName = (s: OrderSize | undefined) =>
    s ? `${s.sheets ?? '—'} × ${s.length ?? '—'} mm` : '—';
  const orderName = (id: string) => {
    const o = findOrder(id);
    const name = o?.productName?.trim();
    const sizes = o?.sizes ?? [];
    const hint = name || (sizes.length
      ? `${sizeName(sizes[0])}${sizes.length > 1 ? ` +${sizes.length - 1}` : ''}`
      : '');
    return [tag(id), hint].filter(Boolean).join(' · ');
  };
  const shortName = (id: string) => {
    const name = findOrder(id)?.productName?.trim();
    return name ? `${tag(id)} ${name}` : tag(id);
  };
  const sizeOf = (orderId: string, key: string, from: DiffSide): OrderSize | undefined => {
    const v = from === 'original' ? original : production;
    const o = ordersOf(v).find((x) => x.id === orderId);
    if (!o?.sizes) return undefined;
    return key.startsWith('#') ? o.sizes[Number(key.slice(1))] : o.sizes.find((s) => s?.uid === key);
  };
  const sizeLabel = (orderId: string, key: string) =>
    key === 'm'
      ? t('orders.totalLength')
      : `${(sizeOf(orderId, key, 'original') ?? sizeOf(orderId, key, 'production'))?.length ?? '—'} mm`;
  const num = (v: unknown) =>
    typeof v === 'number' ? v.toLocaleString(lang) : v == null || v === '' ? '—' : String(v);
  const yesNo = (v: unknown) => (v ? t('compare.yes') : t('compare.no'));

  const fieldTitle: Record<string, string> = {
    productName: t('orders.productName'),
    speedMPerMin: t('orders.speed'),
    cavity: t('orders.cavity'),
    gapEnabled: t('orders.togglePause'),
    gapAfterMin: t('orders.gapAfter'),
    gapReason: t('orders.pauseReason'),
    useTotalLength: t('orders.toggleTotalLength'),
    totalLengthM: t('orders.totalLength'),
    sheets: profiles ? t('orders.profiles') : t('orders.sheets'),
    sheetLengthMm: profiles ? t('orders.profileLength') : t('orders.sheetLength'),
    length: profiles ? t('orders.profileLength') : t('orders.sheetLength'),
    profilesPerPackage: t('orders.profilesPerPackage'),
  };

  const title = (d: CalcDiff): string => {
    switch (d.kind) {
      case 'setting':
        return t(`compare.setting.${d.key}`);
      case 'orderSequence':
        return t('compare.orderSequence');
      case 'orderAdded':
        return t('compare.orderAdded', { name: orderName(d.orderId) });
      case 'orderRemoved':
        return t('compare.orderRemoved', { name: orderName(d.orderId) });
      case 'orderField':
        return fieldTitle[d.field] ?? d.field;
      case 'sizeSequence':
        return t('compare.sizeSequence');
      case 'sizeAdded':
        return t('compare.sizeAdded');
      case 'sizeRemoved':
        return t('compare.sizeRemoved');
      case 'sizeField':
        return `${sizeLabel(d.orderId, d.sizeKey)} · ${fieldTitle[d.field] ?? d.field}`;
      case 'produced':
        return `${sizeLabel(d.orderId, d.sizeKey)} · ${t('results.produced')}`;
      case 'orderDone':
        return t('compare.state');
    }
  };

  const value = (d: CalcDiff, from: DiffSide): string => {
    switch (d.kind) {
      case 'setting':
        if (d.key === 'productName') return num(d[from]);
        if (d.key === 'queue')
          return Array.isArray(d[from]) && (d[from] as unknown[]).length
            ? t('compare.queueOn')
            : '—';
        return yesNo(d[from]);
      case 'orderSequence':
        return d[from].map(shortName).join(' → ');
      case 'orderAdded':
      case 'orderRemoved': {
        const presentIn: DiffSide = d.kind === 'orderAdded' ? 'production' : 'original';
        if (presentIn !== from) return '—';
        const sizes = d.order.sizes ?? [];
        return sizes.length ? sizes.map(sizeName).join(', ') : t('compare.present');
      }
      case 'orderField': {
        const v = d[from];
        if (d.field === 'gapEnabled' || d.field === 'useTotalLength') return yesNo(v);
        if (d.field === 'gapAfterMin')
          return typeof v === 'number' ? formatDuration(v, units) : '—';
        if (d.field === 'totalLengthM') return typeof v === 'number' ? `${num(v)} m` : '—';
        if (d.field === 'gapReason') return (v as { name?: string } | undefined)?.name ?? '—';
        return num(v);
      }
      case 'sizeSequence':
        return d[from].map((k) => sizeName(sizeOf(d.orderId, k, from))).join(' → ');
      case 'sizeAdded':
      case 'sizeRemoved': {
        const presentIn: DiffSide = d.kind === 'sizeAdded' ? 'production' : 'original';
        return presentIn === from ? sizeName(d.size) : '—';
      }
      case 'sizeField':
        return d.field === 'length' && typeof d[from] === 'number'
          ? `${num(d[from])} mm`
          : num(d[from]);
      case 'produced':
        return d.sizeKey === 'm' ? `${num(d[from])} m` : num(d[from]);
      case 'orderDone':
        return d[from] ? t('compare.done') : t('compare.running');
    }
  };

  return { title, value, orderName };
}

export default CompareModal;
