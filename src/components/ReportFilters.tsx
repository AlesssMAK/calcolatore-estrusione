import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { slotLabel, type ReportMode, type ReportMoment } from '../hooks/useReportMoment';
import { formatDateParts } from '../utils/format';
import DateTimePicker from './DateTimePicker';

const MODES: ReportMode[] = ['current', 'closing', 'at'];

const fieldCls =
  'h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';

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
        // The calendar of the start time (Data e Ora di Inizio): day and
        // time in one, the times every half hour.
        <div>
          <label htmlFor="report-at" className="sr-only">
            {t('report.tabs.at')}
          </label>
          <DateTimePicker
            id="report-at"
            selected={new Date(`${day}T${slotLabel(slot)}`)}
            onChange={(d) => {
              if (!d) return;
              setDay(format(d, 'yyyy-MM-dd'));
              const m = d.getHours() * 60 + d.getMinutes();
              setSlot(Math.min(23 * 60 + 30, Math.round(m / 30) * 30));
            }}
            timeIntervals={30}
            className={fieldCls}
          />
        </div>
      )}
    </div>
  );
}
