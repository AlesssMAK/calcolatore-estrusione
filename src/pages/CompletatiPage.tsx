import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import PageActions from '../components/PageActions';
import CompletedCalcCard from '../components/CompletedCalcCard';
import DateTimePicker from '../components/DateTimePicker';
import { useCatalog } from '../contexts/CatalogContext';
import { loadCompanyCalcs, type CompanyCalc } from '../lib/sharedCalc';
import { saveProductionStart, stashCompanyOpen } from '../lib/productionView';
import { endOf, isFinished, weekStart } from '../utils/companyReport';

const DAY_MS = 86_400_000;

/** When they ended: all of them kept, this week, this month, or a period. */
type Span = 'all' | 'week' | 'month' | 'range';
const SPANS: Span[] = ['all', 'week', 'month', 'range'];

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

  // Every word typed somewhere in it; ended in the span (a period: between
  // the two days, both in).
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let lo = -Infinity;
    let hi = Infinity;
    if (span === 'week') lo = weekStart(now).getTime();
    if (span === 'month') lo = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    if (span === 'range') {
      if (from) lo = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
      if (to) hi = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
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
            {/* As the Produzione page's: when they ended (tabs, then what the
                tab looks at), then what's typed. */}
            <div className="mb-3 space-y-3">
              <div
                role="tablist"
                aria-label={t('completed.title')}
                className="grid grid-cols-4 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
              >
                {SPANS.map((s) => (
                  <button
                    key={s}
                    role="tab"
                    type="button"
                    aria-selected={span === s}
                    onClick={() => setSpan(s)}
                    className={
                      span === s
                        ? 'rounded-md bg-brand-600 px-1 py-2 text-xs font-semibold text-white transition sm:text-sm'
                        : 'rounded-md px-1 py-2 text-xs font-medium text-ink-soft transition hover:bg-neutral-100 sm:text-sm'
                    }
                  >
                    {t(`completed.tabs.${s}`)}
                  </button>
                ))}
              </div>
              {span === 'range' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <label htmlFor="completed-from" className="mb-1 block text-xs text-ink-soft">
                      {t('completed.from')}
                    </label>
                    <DateTimePicker
                      id="completed-from"
                      dateOnly
                      clearable
                      selected={from}
                      onChange={setFrom}
                      className={fieldCls}
                      wrapperClassName="block w-full"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="completed-to" className="mb-1 block text-xs text-ink-soft">
                      {t('completed.to')}
                    </label>
                    <DateTimePicker
                      id="completed-to"
                      dateOnly
                      clearable
                      selected={to}
                      onChange={setTo}
                      className={fieldCls}
                      wrapperClassName="block w-full"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-soft">
                  {span === 'week'
                    ? t('completed.hintWeek')
                    : span === 'month'
                      ? t('completed.hintMonth')
                      : t('completed.keptFor', { n: settings.completedRetentionDays })}
                </p>
              )}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('completed.search')}
                aria-label={t('completed.search')}
                className={fieldCls}
              />
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSpan('all');
                    setFrom(null);
                    setTo(null);
                  }}
                  className="text-xs font-medium text-brand-700 transition hover:text-brand-800"
                >
                  ↺ {t('completed.clear')}
                </button>
              )}
            </div>

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
