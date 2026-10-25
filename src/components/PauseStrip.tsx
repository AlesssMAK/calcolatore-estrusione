import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { ScheduledOrder } from '../types';
import { pauseColorHex } from '../lib/pauseReasons';
import { formatDuration } from '../utils/format';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * The pause after an order (closing its block) in the results: a slim strip
 * tinted with its reason's colour — name, duration and when it runs
 * ("14:00 → 16:00", with the day when it isn't today / spans days). Marked
 * "in corso" while it's running.
 */
function PauseStrip({ row, now }: { row: ScheduledOrder; now: Date }) {
  const { t } = useTranslation();
  const reason = row.order.gapReason;
  const hex = pauseColorHex(reason?.color ?? 'grey');
  const from = row.gapStart;
  const to = row.gapEnd;
  const running =
    !!from && !!to && from.getTime() <= now.getTime() && now.getTime() < to.getTime();
  const units = { day: t('units.day'), hour: t('units.hour'), minute: t('units.minute') };
  const when = (d: Date, withDay: boolean) => format(d, withDay ? 'dd.MM HH:mm' : 'HH:mm');

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-3 py-1.5 text-xs text-ink sm:text-sm"
      style={{ backgroundColor: `${hex}14`, borderColor: `${hex}66` }}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: hex }}
      />
      <span className="min-w-0 truncate font-semibold">
        ⏸ {reason?.name ?? t('results.pause')}
      </span>
      <span className="shrink-0 text-ink-soft">
        · {formatDuration(row.gapAfterMin, units)}
      </span>
      {running && (
        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 sm:text-xs">
          {t('results.pauseNow')}
        </span>
      )}
      {from && to && (
        <span className="ml-auto shrink-0 whitespace-nowrap text-ink-soft">
          {when(from, !sameDay(from, now))} → {when(to, !sameDay(from, to))}
        </span>
      )}
    </div>
  );
}

export default PauseStrip;
