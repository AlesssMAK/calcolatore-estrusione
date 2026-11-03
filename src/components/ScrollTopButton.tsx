import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronUpIcon } from './ActionIcons';
import type { FloatPlacement } from './floatStyles';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** Scroll-to-top, only once the page has actually been scrolled down. Rail:
 *  set a bit apart below the actions above it, `invisible` keeps its slot so
 *  they don't jump. Phone bar: pinned to the right edge, apart from centered
 *  actions. Style ported from Syllert's ScrollToTopButton (brand red here): a
 *  framed square whose inner fill grows with scroll progress (0.48 → 1). */
export function ScrollTopButton({ placement: p }: { placement: FloatPlacement }) {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(() => window.scrollY > 200);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const max = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      setScrolled(y > 200);
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.documentElement);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);
  const fillScale = 0.48 + progress * (1 - 0.48);

  return (
    <button
      type="button"
      onClick={(e) => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        e.currentTarget.blur();
      }}
      title={t('actions.scrollTop')}
      aria-label={t('actions.scrollTop')}
      tabIndex={scrolled ? undefined : -1}
      style={{ ['--fill' as string]: String(fillScale * 0.9) }}
      className={`group flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-brand-600 bg-white/20 backdrop-blur-sm transition duration-200 focus-visible:shadow-[0_0_0_3px_rgba(200,16,46,0.25)] focus-visible:outline-none active:bg-brand-600 ${
        p === 'rail'
          ? 'relative mt-4'
          : 'absolute right-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))]'
      } ${
        scrolled
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : p === 'bar'
            ? 'hidden'
            : 'invisible translate-y-2.5 opacity-0'
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-0 scale-(--fill) rounded-sm bg-brand-600 transition-transform duration-100 ease-linear group-hover:scale-[1.2] group-active:scale-0"
      />
      <ChevronUpIcon className="relative h-5 w-5 text-white" />
    </button>
  );
}

/** Just the scroll-to-top, where the calculator pins its actions (a page
 *  without them). */
export default function FloatingScrollTop() {
  const isPhone = useMediaQuery('(max-width: 639px)');
  const p: FloatPlacement = isPhone ? 'bar' : 'rail';
  return createPortal(
    <div
      className={`no-print pointer-events-none fixed z-40 flex ${
        p === 'bar'
          ? 'inset-x-0 bottom-0 justify-center px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'right-3 bottom-4 flex-col justify-end'
      }`}
    >
      <ScrollTopButton placement={p} />
    </div>,
    document.body,
  );
}
