import { useTranslation } from 'react-i18next';
import { slotLabel, type ReportMode, type ReportMoment } from '../hooks/useReportMoment';
import { formatDateParts } from '../utils/format';

const MODES: ReportMode[] = ['current', 'closing', 'at'];

// 30-minute slots of a day, as minutes from midnight.
const SLOTS = Array.from({ length: 48 }, (_, i) => i * 30);

const selectCls =
  'h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';

/** "In Corso / Alla Chiusura / Data e Ora" tabs, with what each looks at. */
export default function ReportFilters({
  moment,
  className = '',
}: {
  moment: ReportMoment;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const { mode, setMode, day, setDay, slot, setSlot, closing } = moment;
  const closingParts = closing ? formatDateParts(closing, lang) : null;

  return (
    <div className={`space-y-3 ${className}`}>
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

      {mode === 'current' && <p className="text-sm text-ink-soft">{t('report.currentHint')}</p>}
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
  );
}
