import { useTranslation } from 'react-i18next';

/** The order's own number next to its "#N" — nothing when it has none. */
export default function OrderNumberTag({
  value,
  className = '',
}: {
  value?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const number = value?.trim();
  if (!number) return null;
  return (
    <span
      title={t('orders.orderNumber')}
      className={`inline-block max-w-40 shrink-0 truncate rounded border border-neutral-300 bg-white px-1.5 py-0.5 align-middle text-[11px] font-semibold text-ink ${className}`}
    >
      {t('orders.orderNumberShort')} {number}
    </span>
  );
}
