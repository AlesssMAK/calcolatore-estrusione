import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';
import { liveSchedule } from '../utils/liveSchedule';
import { queueStatus, stepInfo } from '../utils/queue';

// "Ordine personalizzato attivo — prossima misura: …" while a custom production
// queue still changes what runs next. Disappears on its own once the
// re-arranged sizes are produced (the queue is then dropped on the next calc).
function QueueBanner({ mode }: { mode: CalculatorMode }) {
  'use no memo';
  const { control } = useFormContext<FormValues>();
  const { t } = useTranslation();
  const settings = useWatch({ control, name: 'settings' });
  const orders = useWatch({ control, name: 'orders' });
  if (!settings?.queue?.length || !orders?.length) return null;

  const live = liveSchedule({ settings, orders } as FormValues, mode);
  const status = live ? queueStatus(settings.queue, orders, live) : null;
  if (!status?.active) return null;

  let nextLabel: string | null = null;
  if (status.next) {
    const info = stepInfo(orders, status.next);
    nextLabel = `${info.size} · ${t('queue.orderNo', { n: info.orderNo })}${
      info.name ? ` (${info.name})` : ''
    }`;
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
      <span className="font-medium text-amber-800">🔀 {t('queue.active')}</span>
      {nextLabel && (
        <span className="text-amber-900">
          — {t('queue.next')}: <strong>{nextLabel}</strong>
        </span>
      )}
    </div>
  );
}

export default QueueBanner;
