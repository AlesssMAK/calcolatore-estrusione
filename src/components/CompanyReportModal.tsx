import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useCatalog } from '../contexts/CatalogContext';
import { fetchCompanyCalcs, type CompanyCalc } from '../lib/sharedCalc';
import { nextClosing } from '../utils/calculator';
import { stageAt, type ReportStage } from '../utils/companyReport';
import { loadWeekendPref } from '../utils/defaults';
import { formatDateParts } from '../utils/format';

type ReportMode = 'current' | 'closing' | 'at';
const MODES: ReportMode[] = ['current', 'closing', 'at'];

// 30-minute slots of a day, as minutes from midnight.
const SLOTS = Array.from({ length: 48 }, (_, i) => i * 30);
const slotLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const selectCls =
  'h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';

interface Props {
  onClose: () => void;
  /** Open a listed calc in the calculator (closes the report). */
  onOpen?: (calc: CompanyCalc) => void;
}

/** "Report" of the company's published results (Azienda): for every tracked
 *  calc, where production stands — when the order in progress ends, at the
 *  line's next closing, or at a chosen day + time. "Calcolo fisso" results are
 *  static plans, not tracked → left out. */
function CompanyReportModal({ onClose, onOpen }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const { company, settings } = useCatalog();
  const [calcs, setCalcs] = useState<CompanyCalc[] | null>(null);
  const [mode, setMode] = useState<ReportMode>('current');
  // The moment the report was opened ("now" for the in-progress view).
  const [now] = useState(() => new Date());
  // "Data e ora": today, at the next half hour.
  const [day, setDay] = useState(() => format(now, 'yyyy-MM-dd'));
  const [slot, setSlot] = useState(
    () => Math.min(47, Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) + 1) * 30,
  );

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    void fetchCompanyCalcs(company.slug).then((list) => {
      if (!cancelled) {
        setCalcs(list.filter((c) => !c.payload.values?.settings.frozen));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [company]);

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

  // The line's next closing, on the company schedule (+ this device's weekend
  // shift, as the calculator uses). Null on a 24/7 line.
  const closing = useMemo(
    () =>
      nextClosing(now, {
        weekend: loadWeekendPref(),
        schedule: settings.schedule,
      }),
    [now, settings.schedule],
  );

  // The moment the report looks at (NaN: none — a 24/7 line has no closing).
  const atMs =
    mode === 'current'
      ? now.getTime()
      : mode === 'closing'
        ? (closing?.getTime() ?? NaN)
        : new Date(`${day}T${slotLabel(slot)}`).getTime();

  const rows = useMemo(() => {
    if (!calcs || Number.isNaN(atMs)) return [];
    const at = new Date(atMs);
    const list = calcs.map((c) => ({ calc: c, stage: stageAt(c.payload, at) }));
    // Soonest order end first; finished calcs last, by when they ended.
    const done = (s: ReportStage) => (s.status === 'done' ? 1 : 0);
    const time = (s: ReportStage) =>
      (s.status === 'done' ? s.calcEnd : (s.orderEnd ?? s.calcEnd)).getTime();
    return list.sort(
      (a, b) =>
        done(a.stage) - done(b.stage) || time(a.stage) - time(b.stage),
    );
  }, [calcs, atMs]);
  const closingParts = closing ? formatDateParts(closing, lang) : null;

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
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('report.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden bg-surface-alt shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            <span aria-hidden>📊</span> {t('report.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close')}
            className="rounded p-1.5 text-ink-soft transition hover:bg-neutral-100 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 border-b border-neutral-200 bg-white px-4 py-3">
          <div
            role="tablist"
            aria-label={t('report.title')}
            className="grid grid-cols-3 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
          >
            {MODES.map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? 'rounded-md bg-brand-600 px-1 py-2 text-xs font-semibold text-white transition sm:text-sm'
                    : 'rounded-md px-1 py-2 text-xs font-medium text-ink-soft transition hover:bg-neutral-100 sm:text-sm'
                }
              >
                {t(`report.tabs.${m}`)}
              </button>
            ))}
          </div>

          {mode === 'current' && (
            <p className="text-sm text-ink-soft">{t('report.currentHint')}</p>
          )}
          {mode === 'closing' && (
            <p className="text-sm text-ink-soft">
              {closingParts ? (
                <>
                  {t('report.closingAt')}{' '}
                  <strong className="text-ink">
                    {closingParts.date}, {closingParts.time}
                  </strong>
                </>
              ) : (
                t('report.noClosing')
              )}
            </p>
          )}
          {mode === 'at' && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="block text-xs font-medium tracking-wide text-ink-soft uppercase">
                  {t('report.day')}
                </span>
                <input
                  type="date"
                  value={day}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                  className={`${selectCls} mt-1 w-full min-w-0`}
                />
              </label>
              <label className="shrink-0">
                <span className="block text-xs font-medium tracking-wide text-ink-soft uppercase">
                  {t('report.hour')}
                </span>
                <select
                  value={slot}
                  onChange={(e) => setSlot(Number(e.target.value))}
                  className={`${selectCls} mt-1`}
                >
                  {SLOTS.map((m) => (
                    <option key={m} value={m}>
                      {slotLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {calcs === null ? (
            <p className="py-6 text-center text-sm text-ink-soft">
              {t('report.loading')}
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">
              {mode === 'closing' && !closing
                ? t('report.noClosing')
                : t('report.empty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map(({ calc, stage }) => (
                <li key={calc.id}>
                  <button
                    type="button"
                    onClick={
                      onOpen
                        ? () => {
                            onOpen(calc);
                            onClose();
                          }
                        : undefined
                    }
                    className="block w-full rounded-lg border border-neutral-200 bg-white p-3 text-left text-sm shadow-sm transition hover:border-brand-300"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold text-ink">
                        {calc.payload.label || '—'}
                      </span>
                      <StatusChip status={stage.status} label={t(`report.status.${stage.status}`)} />
                    </span>

                    {stage.orderNo !== undefined && (
                      <>
                        <span className="mt-1.5 flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                            #{stage.orderNo}
                          </span>
                          {stage.productName && (
                            <span className="min-w-0 truncate text-ink">
                              {stage.productName}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-ink-soft">
                          {stage.sizeLength !== undefined && (
                            <>{stage.sizeLength} mm · </>
                          )}
                          <strong className="text-ink">{stage.produced ?? 0}</strong>
                          {stage.total !== undefined && <> / {stage.total}</>}{' '}
                          {stage.unit === 'meters'
                            ? 'm'
                            : t(
                                calc.payload.mode === 'profiles'
                                  ? 'report.unitProfiles'
                                  : 'report.unitSheets',
                              )}
                        </span>
                      </>
                    )}

                    <span className="mt-2 flex items-baseline justify-between gap-3">
                      <span className="shrink-0 text-xs tracking-wide text-ink-soft uppercase">
                        {stage.status === 'done'
                          ? t('report.ended')
                          : stage.status === 'notStarted'
                            ? t('report.starts')
                            : t('report.orderEnd')}
                      </span>
                      <span className="min-w-0 text-right font-semibold text-brand-700">
                        {dateTime(
                          stage.status === 'done'
                            ? stage.calcEnd
                            : stage.status === 'notStarted'
                              ? (stage.stepStart ?? stage.calcEnd)
                              : (stage.orderEnd ?? stage.calcEnd),
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({
  status,
  label,
}: {
  status: ReportStage['status'];
  label: string;
}) {
  const cls =
    status === 'running'
      ? 'text-ink'
      : status === 'done'
        ? 'bg-success/10 text-success'
        : 'bg-neutral-100 text-ink-soft';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {status === 'running' && (
        <span
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500"
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}

export default CompanyReportModal;
