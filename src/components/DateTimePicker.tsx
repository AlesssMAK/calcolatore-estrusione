import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DatePicker, { registerLocale } from 'react-datepicker';
import { it as itLocale } from 'date-fns/locale/it';
import { es as esLocale } from 'date-fns/locale/es';
import { enUS as enLocale } from 'date-fns/locale/en-US';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { inputBase } from './formStyles';

registerLocale('it', itLocale);
registerLocale('es', esLocale);
registerLocale('en', enLocale);

/**
 * The app's day + time picker, one look everywhere (index.css): the month
 * with the time list beside it, in a popup under the field (above any modal,
 * never cut by it); on a phone (≤480px) a full-width sheet over the page —
 * the time list under the month — with the page held still behind it.
 */
export default function DateTimePicker({
  id,
  selected,
  onChange,
  timeIntervals = 15,
  placeholder,
  minDate,
  filterDate,
  filterTime,
  invalid,
  className = inputBase,
  wrapperClassName = 'block w-full sm:max-w-xs',
}: {
  id: string;
  selected: Date | null;
  onChange: (d: Date | null) => void;
  /** Minutes between the times of the list. */
  timeIntervals?: number;
  placeholder?: string;
  minDate?: Date;
  filterDate?: (d: Date) => boolean;
  filterTime?: (d: Date) => boolean;
  /** In error: framed red (its message: a wrapper's data-error). */
  invalid?: boolean;
  /** The field's classes (the calendar looks the same whatever they are). */
  className?: string;
  wrapperClassName?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'it') as 'it' | 'en' | 'es';
  const isMobile = useMediaQuery('(max-width: 480px)');
  const [open, setOpen] = useState(false);

  // Phone: the sheet scrolls, the page under it doesn't.
  useEffect(() => {
    if (!open || !isMobile) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open, isMobile]);

  return (
    <DatePicker
      id={id}
      selected={selected}
      onChange={onChange}
      showTimeSelect
      timeIntervals={timeIntervals}
      dateFormat="dd/MM/yyyy HH:mm"
      timeFormat="HH:mm"
      timeCaption={t('settings.time')}
      locale={lang}
      placeholderText={placeholder}
      ariaInvalid={invalid ? 'true' : undefined}
      minDate={minDate}
      filterDate={filterDate}
      filterTime={filterTime}
      withPortal={isMobile}
      portalId="datepicker-portal"
      onCalendarOpen={() => setOpen(true)}
      onCalendarClose={() => setOpen(false)}
      className={className}
      wrapperClassName={wrapperClassName}
      popperPlacement="bottom-start"
      calendarClassName="rdp-mobile-stack"
    />
  );
}
