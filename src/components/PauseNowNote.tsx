import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { pauseColorHex } from '../lib/pauseReasons';
import type { RunningPause } from '../utils/pauseAt';

/** "⏸ Cambio stampo · fino alle 16:00" — the pause running now, tinted with
 *  its reason's colour (Produzione list, Report, active-order modal). */
function PauseNowNote({
  pause,
  now,
  className = '',
}: {
  pause: RunningPause;
  now: Date;
  className?: string;
}) {
  const { t } = useTranslation();
  const hex = pauseColorHex(pause.color ?? 'grey');
  const sameDay = pause.until.toDateString() === now.toDateString();
  const time = format(pause.until, sameDay ? 'HH:mm' : 'dd.MM HH:mm');
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs text-ink ${className}`}
      style={{ backgroundColor: `${hex}14`, borderColor: `${hex}66` }}
    >
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: hex }}
      />
      <span className="min-w-0 truncate font-semibold">
        ⏸ {pause.name ?? t('results.pause')}
      </span>
      <span className="shrink-0 whitespace-nowrap text-ink-soft">
        · {t('report.pauseUntil', { time })}
      </span>
    </span>
  );
}

export default PauseNowNote;
