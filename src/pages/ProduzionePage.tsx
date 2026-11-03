import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import PauseNowNote from '../components/PauseNowNote';
import { StatusChip } from '../components/CompanyReportModal';
import { useCatalog } from '../contexts/CatalogContext';
import { loadCompanyCalcs, type CompanyCalc } from '../lib/sharedCalc';
import { markLaunchDone, saveProductionStart, stashCompanyOpen } from '../lib/productionView';
import { stageAt, stageSizes, type ReportStage, type StageSize } from '../utils/companyReport';
import { formatDateParts, formatShortDateTime } from '../utils/format';

/** How often the times / counts move on, and the list is read again (ms). */
const TICK_MS = 30_000;
const REFRESH_MS = 60_000;

/**
 * Produzione: every company calc in production now, live — the order on the
 * line with when it ends, the size being made with when it ends, and (folded,
 * like "Calcolo Avanzato") every size of the order: how many, how far, when it
 * ends. Counts follow the published schedule as time passes; the list is read
 * again every minute and when the app comes back to the screen. Paused /
 * "Calcolo Fisso" results are static plans → left out, as in the Report.
 */
export default function ProduzionePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const { company, loading } = useCatalog();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [calcs, setCalcs] = useState<CompanyCalc[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [readAt, setReadAt] = useState<Date | null>(null);
  // Calcs whose sizes are unfolded (by id).
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  useEffect(() => markLaunchDone(), []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    const read = () => {
      if (document.visibilityState === 'hidden') return;
      void loadCompanyCalcs(company.slug).then((list) => {
        // Offline / error → keep showing the last list.
        if (cancelled || !list) return;
        setCalcs(list);
        const at = new Date();
        setNow(at);
        setReadAt(at);
      });
    };
    read();
    const id = window.setInterval(read, REFRESH_MS);
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [company]);

  // In production now (on the line, the line stopped, or a pause between
  // blocks); the order ending soonest first.
  const rows = useMemo(
    () =>
      (calcs ?? [])
        .filter((c) => !c.payload.values?.settings.frozen)
        .map((calc) => ({ calc, stage: stageAt(calc.payload, now) }))
        .filter(({ stage }) => stage.status !== 'done' && stage.status !== 'notStarted')
        .sort(
          (a, b) =>
            (a.stage.orderEnd ?? a.stage.calcEnd).getTime() -
            (b.stage.orderEnd ?? b.stage.calcEnd).getTime(),
        ),
    [calcs, now],
  );

  const openInCalculator = (calc: CompanyCalc) => {
    stashCompanyOpen(calc);
    navigate(`/${search}`);
  };
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-h-full bg-surface-alt">
      <Header title={t('production.title')} production="page" />

      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink sm:text-lg">
            <span
              className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
              aria-hidden
            />
            {t('production.heading')}
          </h2>
          {readAt && (
            <span className="text-xs text-ink-soft">
              {t('production.live', { time: formatDateParts(readAt, lang).time })}
            </span>
          )}
        </div>

        {!company ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white/50 p-5 text-center text-sm text-ink-soft">
            {loading ? (
              t('report.loading')
            ) : (
              <>
                <p>{t('production.noCompany')}</p>
                {/* No company → no switch in the header: the way out. */}
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
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white/50 p-5 text-center text-sm text-ink-soft">
            {t('production.empty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ calc, stage }) => (
              <ProductionCard
                key={calc.id}
                calc={calc}
                stage={stage}
                sizes={stageSizes(calc.payload, stage, now)}
                now={now}
                sizesOpen={open.has(calc.id)}
                onToggleSizes={() => toggle(calc.id)}
                onOpen={() => openInCalculator(calc)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function ProductionCard({
  calc,
  stage,
  sizes,
  now,
  sizesOpen,
  onToggleSizes,
  onOpen,
}: {
  calc: CompanyCalc;
  stage: ReportStage;
  sizes: StageSize[];
  now: Date;
  sizesOpen: boolean;
  onToggleSizes: () => void;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const running = stage.status === 'running';
  const unit =
    stage.unit === 'meters'
      ? 'm'
      : t(calc.payload.mode === 'profiles' ? 'report.unitProfiles' : 'report.unitSheets');
  const multiSize = sizes.length > 1;
  const dateTime = (d: Date) => {
    const p = formatDateParts(d, lang);
    return (
      <span className="inline-flex flex-wrap justify-end gap-x-1.5">
        <span className="whitespace-nowrap">{p.date}</span>
        <span className="whitespace-nowrap">{p.time}</span>
      </span>
    );
  };

  return (
    <li className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        title={t('production.open')}
        className="flex w-full items-start justify-between gap-2 rounded-t-xl px-3 pt-3 text-left transition hover:bg-brand-50/50 sm:px-4"
      >
        <span className="flex min-w-0 items-center gap-1 font-semibold text-ink">
          <span className="min-w-0 truncate">{calc.payload.label || '—'}</span>
          <span aria-hidden className="shrink-0 text-ink-soft">
            ›
          </span>
        </span>
        <StatusChip status={stage.status} label={t(`report.status.${stage.status}`)} />
      </button>

      <div className="px-3 pt-1.5 pb-3 sm:px-4">
        {stage.pause && <PauseNowNote pause={stage.pause} now={now} className="mb-1.5" />}

        {stage.orderNo !== undefined && (
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
              #{stage.orderNo}
            </span>
            {stage.productName && (
              <span className="min-w-0 truncate text-ink">{stage.productName}</span>
            )}
          </span>
        )}

        {/* The size on the line: how far, and (several sizes) when it ends. */}
        <div
          className={`mt-2 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs ${
            running ? 'active-blink' : ''
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-ink-soft">
              {stage.sizeLength !== undefined && <>{stage.sizeLength} mm · </>}
              <strong className={`text-ink ${running ? 'num-blink' : ''}`}>
                {stage.produced ?? 0}
              </strong>
              {stage.total !== undefined && <> / {stage.total}</>} {unit}
            </span>
            {multiSize && stage.stepEnd && (
              <span className="flex items-baseline gap-1.5">
                <span className="text-ink-soft">{t('production.sizeEnd')}</span>
                <strong className="text-brand-700">{dateTime(stage.stepEnd)}</strong>
              </span>
            )}
          </div>
        </div>

        {multiSize && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onToggleSizes}
              aria-expanded={sizesOpen}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800 sm:text-sm"
            >
              {sizesOpen ? '▾' : '▸'} {t('production.sizes', { n: sizes.length })}
            </button>
            {sizesOpen && (
              <ul className="mt-2 space-y-1 rounded-md border border-brand-100 bg-brand-50/40 p-1.5 text-xs sm:p-2">
                {sizes.map((s) => (
                  <li
                    key={s.idx}
                    className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${
                      s.state === 'active'
                        ? `border border-brand-200 bg-brand-50 ${running ? 'active-blink' : ''}`
                        : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={
                          s.state === 'done'
                            ? 'font-semibold text-success'
                            : s.state === 'active'
                              ? 'font-semibold text-brand-700'
                              : 'text-ink-soft'
                        }
                      >
                        {s.state === 'done' ? '✓' : '↳'} #{stage.orderNo}.{s.idx + 1}
                      </span>{' '}
                      <span className={s.state === 'done' ? 'text-ink-soft' : 'text-ink'}>
                        {s.sheets} × {s.length} mm
                      </span>
                      {s.state === 'active' && (
                        <span className="text-ink-soft">
                          {' · '}
                          <strong className={`text-ink ${running ? 'num-blink' : ''}`}>
                            {s.produced}
                          </strong>{' '}
                          / {s.sheets}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap ${
                        s.state === 'done'
                          ? 'text-success'
                          : s.state === 'active'
                            ? 'font-semibold text-brand-700'
                            : 'font-medium text-ink'
                      }`}
                    >
                      {formatShortDateTime(s.end, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-neutral-100 pt-2">
          <span className="shrink-0 text-xs tracking-wide text-ink-soft uppercase">
            {t('report.orderEnd')}
          </span>
          <span className="min-w-0 text-right text-sm font-semibold text-brand-700">
            {dateTime(stage.orderEnd ?? stage.calcEnd)}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-ink-soft">
          <span className="shrink-0">{t('production.calcEnd')}</span>
          <span className="min-w-0 text-right">{dateTime(stage.calcEnd)}</span>
        </div>
      </div>
    </li>
  );
}
