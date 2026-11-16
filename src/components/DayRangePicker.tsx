import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';
import { useMediaQuery } from '../hooks/useMediaQuery';

/**
 * Days on one calendar, as in Syllert: the first tap picks a day, a second one
 * the end of a period (either order) and closes it; closed after the first,
 * it's that one day. Opened by `trigger` (the app's calendar look; on a phone
 * the full-width sheet, the page held still behind it).
 */
export default function DayRangePicker({
  start,
  end,
  onChange,
  trigger,
  onOpen,
}: {
  start: Date | null;
  end: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  /** What opens it (gets its onClick). */
  trigger: ReactElement;
  /** Called as it opens. */
  onOpen?: () => void;
}) {
  const { i18n } = useTranslation();
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
      selectsRange
      startDate={start}
      endDate={end}
      selected={start}
      onChange={([s, e]: [Date | null, Date | null]) => onChange(s, e)}
      locale={lang}
      customInput={trigger}
      withPortal={isMobile}
      portalId="datepicker-portal"
      onCalendarOpen={() => {
        setOpen(true);
        onOpen?.();
      }}
      onCalendarClose={() => setOpen(false)}
      wrapperClassName="block w-full"
      popperPlacement="bottom-end"
      calendarClassName="rdp-mobile-stack"
    />
  );
}
