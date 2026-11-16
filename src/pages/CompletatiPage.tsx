import { useEffect, useMemo, useState, type MouseEventHandler, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import PageActions from '../components/PageActions';
import CompletedCalcCard from '../components/CompletedCalcCard';
import DayRangePicker from '../components/DayRangePicker';
import { useCatalog } from '../contexts/CatalogContext';
import { loadCompanyCalcs, type CompanyCalc } from '../lib/sharedCalc';
import { saveProductionStart, stashCompanyOpen } from '../lib/productionView';
import { endOf, isFinished, weekStart } from '../utils/companyReport';

const DAY_MS = 86_400_000;

/** When they ended: all of them kept, this week, this month, or a day / a
 *  period picked on the calendar. */
type Span = 'all' | 'week' | 'month' | 'date';
const SPANS: Span[] = ['all', 'week', 'month', 'date'];

const tabCls = (on: boolean) =>
  on
    ? 'block w-full truncate rounded-md bg-brand-600 px-1 py-2 text-xs font-semibold text-white transition sm:text-sm'
    : 'block w-full truncate rounded-md px-1 py-2 text-xs font-medium text-ink-soft transition hover:bg-neutral-100 sm:text-sm';

/** The days picked, short: "18.11", "16–20.11", "28.10–3.11" (with the year
 *  when it isn't this one). */
function shortDays(start: Date, end: Date | null): string {
  const thisYear = start.getFullYear() === new Date().getFullYear();
  const day = (d: Date) =>
    `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}${
      thisYear ? '' : `.${String(d.getFullYear()).slice(2)}`
    }`;
  if (!end || end.toDateString() === start.toDateString()) return day(start);
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return `${sameMonth ? start.getDate() : day(start)}–${day(end)}`;
}

/** The "Data" tab: opens the calendar (DayRangePicker's onClick), the days
 *  picked as its label. */
function DateTab({
  ref,
  onClick,
  label,
  active,
  onActivate,
}: {
  ref?: Ref<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  label: string;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={(e) => {
        onActivate();
        onClick?.(e);
      }}
      className={tabCls(active)}
    >
      📅 {label}
    </button>
  );
}

const fieldCls =
  'h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';

/** What a finished calc is found by: its name, its products, its orders'
 *  numbers. */
function haystack(c: CompanyCalc): string {
  const rows = [...(c.payload.completedRows ?? []), ...c.payload.result.rows];
  return [
    c.payload.label ?? '',
    ...rows.map((r) => r.order?.productName ?? ''),
    ...rows.map((r) => r.order?.orderNumber ?? ''),
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Completati: the company's calcs whose production is over — kept the
 * company's number of days after they end (admin, at most 90) — the latest
 * first. Found by what's typed (name, product, order number) and by the day
 * they ended; a tap opens a calc's result.
 */
export default function CompletatiPage() {
  const { t } = useTranslation();
  const { company, loading, settings } = useCatalog();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [calcs, setCalcs] = useState<CompanyCalc[] | null>(null);
  const [now] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [span, setSpan] = useState<Span>('all');
  // The day picked, and the period's end (none: that one day).
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  // Bumped when Salvati published / took off a calc: the list is read again.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    void loadCompanyCalcs(company.slug).then((list) => {
      if (!cancelled) setCalcs((cur) => list ?? cur ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [company, reloadKey]);

  // Finished and still kept, the latest first.
  const finished = useMemo(() => {
    const keepFrom = now.getTime() - settings.completedRetentionDays * DAY_MS;
    return (calcs ?? [])
      .filter((c) => isFinished(c.payload, now) && endOf(c.payload).getTime() >= keepFrom)
      .sort((a, b) => endOf(b.payload).getTime() - endOf(a.payload).getTime());
  }, [calcs, now, settings.completedRetentionDays]);

  // Every word typed somewhere in it; ended in the span (picked days: that
  // day, or between the two, both in).
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let lo = -Infinity;
    let hi = Infinity;
    if (span === 'week') lo = weekStart(now).getTime();
    if (span === 'month') lo = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    if (span === 'date' && from) {
      const last = to ?? from;
      lo = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
      hi = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime();
    }
    return finished.filter((c) => {
      const end = endOf(c.payload).getTime();
      if (end < lo || end >= hi) return false;
      const text = haystack(c);
      return words.every((w) => text.includes(w));
    });
  }, [finished, query, span, from, to, now]);

  const filtered = query.trim() !== '' || span !== 'all';
  const open = (calc: CompanyCalc) => {
    stashCompanyOpen(calc);
    navigate(`/${search}`);
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <Header title={t('completed.title')} />

      {/* Phone: room at the bottom for the pinned buttons. */}
      <main className="mx-auto max-w-3xl px-3 pt-4 pb-20 sm:px-4 sm:py-8">

        {!company ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white/50 p-5 text-center text-sm text-ink-soft">
            {loading ? (
              t('report.loading')
            ) : (
              <>
                <p>{t('production.noCompany')}</p>
                <button
                  type="button"
                  onClick={() => {
                    saveProductionStart(false);
                    navigate(`/${search}`);
                  }}
                  className="mt-3 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
                >
                  ← {t('production.toCalculator')}
                </button>
              </>
            )}
          </div>
        ) : calcs === null ? (
          <p className="py-6 text-center text-sm text-ink-soft">{t('report.loading')}</p>
        ) : (
          <>
            {/* The filters, one block: when they ended (the tabs — "Data" opens
                the calendar), then what's typed. */}
            <div className="mb-2 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm">
              <div
                role="tablist"
                aria-label={t('completed.title')}
                className="grid grid-cols-4 gap-0.5"
              >
                {SPANS.map((s) =>
                  s === 'date' ? (
                    <DayRangePicker
                      key={s}
                      start={from}
                      end={to}
                      onChange={(a, b) => {
                        setFrom(a);
                        setTo(b);
                      }}
                      trigger={
                        <DateTab
                          label={
                            span === 'date' && from
                              ? shortDays(from, to)
                              : t('completed.tabs.date')
                          }
                          active={span === 'date'}
                          onActivate={() => setSpan('date')}
                        />
                      }
                    />
                  ) : (
                    <button
                      key={s}
                      role="tab"
                      type="button"
                      aria-selected={span === s}
                      onClick={() => setSpan(s)}
                      className={tabCls(span === s)}
                    >
                      {t(`completed.tabs.${s}`)}
                    </button>
                  ),
                )}
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('completed.search')}
                aria-label={t('completed.search')}
                className={`${fieldCls} mt-1`}
              />
            </div>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSpan('all');
                  setFrom(null);
                  setTo(null);
                }}
                className="mb-2 text-xs font-medium text-brand-700 transition hover:text-brand-800"
              >
                ↺ {t('completed.clear')}
              </button>
            )}

            {shown.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 bg-white/50 p-5 text-center text-sm text-ink-soft">
                {t(finished.length === 0 ? 'completed.empty' : 'completed.noMatch')}
              </p>
            ) : (
              <ul className="space-y-2">
                {shown.map((calc) => (
                  <CompletedCalcCard key={calc.id} calc={calc} onOpen={() => open(calc)} />
                ))}
              </ul>
            )}
          </>
        )}
        {/* Its buttons at the end, as the form's (pinned while out of view). */}
        <PageActions
          other="produzione"
          className="mt-6"
          onPublished={() => setReloadKey((k) => k + 1)}
        />
      </main>
    </div>
  );
}
