import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import PauseNowNote from '../components/PauseNowNote';
import ProducedEditor from '../components/ProducedEditor';
import { StatusChip } from '../components/CompanyReportModal';
import ReportFilters from '../components/ReportFilters';
import { useReportMoment } from '../hooks/useReportMoment';
import FloatingScrollTop from '../components/ScrollTopButton';
import { useCatalog } from '../contexts/CatalogContext';
import { currentSchedule, editableCompanyIds, saveCompanyPatch } from '../lib/companyEdit';
import { fetchSharedCalc, loadCompanyCalcs, type CompanyCalc } from '../lib/sharedCalc';
import { markLaunchDone, saveProductionStart, stashCompanyOpen } from '../lib/productionView';
import { setProducedNow } from '../utils/calcMerge';
import type { CalcVersion } from '../utils/calcDiff';
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
 * "Calcolo Fisso" results are static plans → left out, as in the Report —
 * whose filters it has too: the same view at the line's closing, or at a
 * chosen day + time. Where this device may edit a calc, the count of the size
 * on the line is corrected right here, as in the active-order modal.
 */
export default function ProduzionePage() {
  const { t } = useTranslation();
  const { company, loading, settings } = useCatalog();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [calcs, setCalcs] = useState<CompanyCalc[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Now, the line's next closing, or a chosen day + time — as in the Report.
  const moment = useReportMoment(now);
  const { mode, closing, atMs } = moment;
  const live = mode === 'current';
  // Calcs whose sizes are unfolded (by id).
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // Transient bottom notice (a count that couldn't be saved).
  const [notice, setNotice] = useState<string | null>(null);

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
        // A count saved here meanwhile wins over a read started before it.
        setCalcs((cur) =>
          list.map((c) => {
            const mine = cur?.find((x) => x.id === c.id);
            return mine && mine.version > c.version ? mine : c;
          }),
        );
        setNow(new Date());
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

  // In production at that moment (on the line, the line stopped, or a pause
  // between blocks), the order ending soonest first; then — looking ahead —
  // the ones finished between now and then, by when they end.
  const rows = useMemo(() => {
    if (Number.isNaN(atMs)) return [];
    const at = new Date(atMs);
    const done = (s: ReportStage) => (s.status === 'done' ? 1 : 0);
    const time = (s: ReportStage) =>
      (s.status === 'done' ? s.calcEnd : (s.orderEnd ?? s.calcEnd)).getTime();
    return (calcs ?? [])
      .filter((c) => !c.payload.values?.settings.frozen)
      .map((calc) => ({ calc, stage: stageAt(calc.payload, at) }))
      .filter(
        ({ stage }) =>
          stage.status !== 'notStarted' &&
          (stage.status !== 'done' || (!live && stage.calcEnd.getTime() > now.getTime())),
      )
      .sort((a, b) => done(a.stage) - done(b.stage) || time(a.stage) - time(b.stage));
  }, [calcs, atMs, now, live]);

  const editable = useMemo(
    () => editableCompanyIds(calcs ?? [], settings.savedRetentionDays),
    [calcs, settings.savedRetentionDays],
  );

  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };
  const replaceCalc = (next: CompanyCalc) => {
    setCalcs((cur) => cur?.map((c) => (c.id === next.id ? next : c)) ?? cur);
    setNow(new Date());
  };

  // The count of a size corrected on a card: recomputed from now and written to
  // the calc itself. A calc changed since it was read shows that first — the
  // count was typed looking at the older one. True once saved.
  const saveProduced = async (
    calc: CompanyCalc,
    orderId: string,
    sizeIdx: number,
    produced: number,
  ): Promise<boolean> => {
    const latest = await fetchSharedCalc(calc.id);
    if (!latest) {
      flashNotice(t('production.saveFailed'));
      return false;
    }
    if (latest.version > calc.version) {
      replaceCalc({ ...calc, ...latest });
      flashNotice(t('production.changed'));
      return false;
    }
    let next: CalcVersion | null = null;
    try {
      next = setProducedNow(
        calc.payload,
        orderId,
        sizeIdx,
        produced,
        currentSchedule(calc.payload, settings),
      );
    } catch (err) {
      console.error('Failed to recompute company calc', calc.id, err);
      flashNotice(t('production.saveFailed'));
      return false;
    }
    if (!next) {
      // Finished in the meantime: the card moves on to what's next.
      setNow(new Date());
      flashNotice(t('production.changed'));
      return false;
    }
    const saved = await saveCompanyPatch(calc, next, settings.savedRetentionDays);
    if (!saved) {
      flashNotice(t('production.saveFailed'));
      return false;
    }
    replaceCalc(saved.calc);
    return true;
  };

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

      {/* Phone: room at the bottom for the pinned scroll-to-top. */}
      <main className="mx-auto max-w-3xl px-3 pt-4 pb-16 sm:px-4 sm:py-8">
        {company && <ReportFilters moment={moment} className="mb-3" />}

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
            {mode === 'closing' && !closing
              ? t('report.noClosing')
              : t(live ? 'production.empty' : 'report.empty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ calc, stage }) => (
              <ProductionCard
                key={calc.id}
                calc={calc}
                stage={stage}
                sizes={stageSizes(calc.payload, stage, new Date(atMs))}
                at={new Date(atMs)}
                live={live}
                sizesOpen={open.has(calc.id)}
                onToggleSizes={() => toggle(calc.id)}
                onOpen={() => openInCalculator(calc)}
                // Now, not on a look ahead; where this device may edit it.
                onSaveProduced={
                  live && editable.has(calc.id)
                    ? (orderId, sizeIdx, n) => saveProduced(calc, orderId, sizeIdx, n)
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </main>
      <FloatingScrollTop />

      {notice && (
        <div
          role="alert"
          className="no-print fixed bottom-4 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

function ProductionCard({
  calc,
  stage,
  sizes,
  at,
  live,
  sizesOpen,
  onToggleSizes,
  onOpen,
  onSaveProduced,
}: {
  calc: CompanyCalc;
  stage: ReportStage;
  sizes: StageSize[];
  /** The moment shown. */
  at: Date;
  /** It's now ("In Corso") — what's on the line blinks. */
  live: boolean;
  sizesOpen: boolean;
  onToggleSizes: () => void;
  onOpen: () => void;
  /** Set the count of a size and recompute; resolves true once saved. Absent →
   *  the count is shown read-only. */
  onSaveProduced?: (orderId: string, sizeIdx: number, produced: number) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const done = stage.status === 'done';
  // What a tap on the count corrects: the size on the line, as in the modal
  // (total-meters orders have no count per size). The editor belongs to that
  // size — it goes when the line moves on to the next one.
  const orderId =
    stage.orderIdx !== undefined ? calc.payload.result.rows[stage.orderIdx]?.order.id : undefined;
  const sizeIdx = stage.sizeIdx ?? 0;
  const target = onSaveProduced && orderId && stage.unit === 'pieces' ? `${orderId}/${sizeIdx}` : null;
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEditing = target !== null && editing === target;
  const running = live && stage.status === 'running';
  const saveProduced = async (n: number) => {
    if (!onSaveProduced || !orderId) return;
    setSaving(true);
    const saved = await onSaveProduced(orderId, sizeIdx, n);
    setSaving(false);
    if (saved) setEditing(null);
  };
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
    // The whole card opens the calc (a tap beside the editor closes that first).
    // Its title is the button for the keyboard: the click comes up to here.
    <li
      onClick={() => {
        if (!isEditing) onOpen();
        else if (!saving) setEditing(null);
      }}
      title={t('production.open')}
      className="cursor-pointer rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:border-brand-300"
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-start justify-between gap-2 rounded-t-xl px-3 pt-3 text-left sm:px-4"
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
        {stage.pause && <PauseNowNote pause={stage.pause} now={at} className="mb-1.5" />}

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
        {!done && (
          <div
            className={`mt-2 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs ${
              running && !isEditing ? 'active-blink' : ''
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-ink-soft">
                {stage.sizeLength !== undefined && (
                  <>
                    {stage.sizeLength} mm{!isEditing && ' · '}
                  </>
                )}
                {!isEditing && (
                  <>
                    {target ? (
                      // Looks like the plain count; a tap opens the editor.
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(target);
                        }}
                        title={t('activeModal.edit')}
                        aria-label={t('activeModal.edit')}
                        className={`-my-1.5 inline-block cursor-pointer rounded px-1.5 py-1.5 text-sm font-semibold text-ink underline decoration-dotted underline-offset-4 transition hover:bg-brand-100 ${
                          running ? 'num-blink' : ''
                        }`}
                      >
                        {stage.produced ?? 0}
                      </button>
                    ) : (
                      <strong className={`text-ink ${running ? 'num-blink' : ''}`}>
                        {stage.produced ?? 0}
                      </strong>
                    )}
                    {stage.total !== undefined && <> / {stage.total}</>} {unit}
                  </>
                )}
              </span>
              {multiSize && stage.stepEnd && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-ink-soft">{t('production.sizeEnd')}</span>
                  <strong className="text-brand-700">{dateTime(stage.stepEnd)}</strong>
                </span>
              )}
            </div>
            {isEditing && (
              <dl className="mt-2">
                <ProducedEditor
                  produced={stage.produced ?? 0}
                  total={stage.total ?? 0}
                  onSave={(n) => void saveProduced(n)}
                  onCancel={() => setEditing(null)}
                  busy={saving}
                />
              </dl>
            )}
          </div>
        )}

        {multiSize && (
          <div className="pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSizes();
              }}
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

        {/* Finished by then (looking ahead): when it ends, as in the Report. */}
        <div
          className={`flex items-baseline justify-between gap-3 ${
            done ? 'mt-1' : 'mt-2.5 border-t border-neutral-100 pt-2'
          }`}
        >
          <span className="shrink-0 text-xs tracking-wide text-ink-soft uppercase">
            {t(done ? 'report.ended' : 'report.orderEnd')}
          </span>
          <span
            className={`min-w-0 text-right text-sm font-semibold ${
              done ? 'text-success' : 'text-brand-700'
            }`}
          >
            {dateTime(done ? stage.calcEnd : (stage.orderEnd ?? stage.calcEnd))}
          </span>
        </div>
        {!done && (
          <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-ink-soft">
            <span className="shrink-0">{t('production.calcEnd')}</span>
            <span className="min-w-0 text-right">{dateTime(stage.calcEnd)}</span>
          </div>
        )}
      </div>
    </li>
  );
}
