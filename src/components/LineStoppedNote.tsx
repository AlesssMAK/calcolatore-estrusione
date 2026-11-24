import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

/** "⏹ riparte alle 10:00" — a calc whose line is stopped now (off the
 *  schedule, or still warming up): when production goes on again (Produzione
 *  list, Report). */
function LineStoppedNote({
  at,
  now,
  className = '',
}: {
  at: Date;
  now: Date;
  className?: string;
}) {
  const { t } = useTranslation();
  const sameDay = at.toDateString() === now.toDateString();
  const time = format(at, sameDay ? 'HH:mm' : 'dd.MM HH:mm');
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs whitespace-nowrap text-ink-soft ${className}`}
    >
      <span aria-hidden>⏹</span>
      {t('report.resumesAt', { time })}
    </span>
  );
}

export default LineStoppedNote;
