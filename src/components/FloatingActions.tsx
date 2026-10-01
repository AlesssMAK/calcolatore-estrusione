import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import SavedCalculationsButton from './SavedCalculationsButton';
import CompanyResultsButton from './CompanyResultsButton';
import type { SavedCalculation } from '../lib/calcHistory';
import type { CompanyCalc } from '../lib/sharedCalc';
import { CalcIcon, ChevronUpIcon, ResetIcon } from './ActionIcons';
import { floatBtnCls, type FloatPlacement } from './floatStyles';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface Props {
  /** Shown while the form's own action buttons are out of view. Kept mounted
   *  (just hidden) so the Saved / Azienda counts don't refetch on every show. */
  visible: boolean;
  /** id of the <form> the pinned "Calcola" submits (it's portalled out of it). */
  formId: string;
  onCalculate: () => void;
  onReset: () => void;
  onRestore?: (entry: SavedCalculation) => void;
  savedRefreshKey?: number;
  onPublish?: (
    entry: SavedCalculation,
    mode: 'view' | 'edit' | 'off',
  ) => void | Promise<void>;
  onOpenCompany?: (calc: CompanyCalc) => void;
  onDeleteCompany?: (calc: CompanyCalc) => void | Promise<void>;
}

/** Pinned, icon-only copy of the form actions (Calcola / Nuovo / Salvati /
 *  Azienda) + scroll-to-top: a bottom bar on phones, a vertical rail on the
 *  right on wider screens. */
function FloatingActions({
  visible,
  formId,
  onCalculate,
  onReset,
  onRestore,
  savedRefreshKey,
  onPublish,
  onOpenCompany,
  onDeleteCompany,
}: Props) {
  const { t } = useTranslation();
  const isPhone = useMediaQuery('(max-width: 639px)');
  const p: FloatPlacement = isPhone ? 'bar' : 'rail';

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  // Scroll-to-top only once the page has actually been scrolled down; its
  // inner fill tracks scroll progress (0.48 → 1), as in Syllert.
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

  return createPortal(
    // The container itself never blocks clicks; the action group shows only
    // while the form's own buttons are off-screen, while scroll-to-top shows
    // whenever the page is scrolled (even with the form buttons in view).
    <div
      className={`no-print pointer-events-none fixed z-40 flex gap-2 transition duration-200 ${
        p === 'bar'
          ? // Transparent row — just the buttons, centered; no backing strip.
            'inset-x-0 bottom-0 justify-center px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'right-3 bottom-4 flex-col justify-end'
      }`}
    >
      <div
        aria-hidden={!visible}
        inert={!visible}
        className={`flex gap-2 transition-opacity duration-200 ${
          p === 'bar' ? '' : 'flex-col'
        } ${
          visible
            ? 'pointer-events-auto opacity-100'
            : p === 'bar'
              ? 'hidden'
              : 'opacity-0'
        }`}
      >
        <button
          type="submit"
          form={formId}
          onClick={onCalculate}
          title={t('actions.calculate')}
          aria-label={t('actions.calculate')}
          className={floatBtnCls(true)}
        >
          <CalcIcon />
        </button>
        <button
          type="button"
          onClick={onReset}
          title={t('actions.reset')}
          aria-label={t('actions.reset')}
          className={floatBtnCls()}
        >
          <ResetIcon />
        </button>
        {onRestore && (
          <SavedCalculationsButton
            placement={p}
            onRestore={onRestore}
            refreshKey={savedRefreshKey}
            onPublish={onPublish}
          />
        )}
        {onOpenCompany && (
          <CompanyResultsButton
            placement={p}
            onOpen={onOpenCompany}
            onDelete={onDeleteCompany}
            refreshKey={savedRefreshKey}
          />
        )}
      </div>
      {/* Only when there's something above to scroll back to. Rail: set a bit
          apart below the actions, `invisible` keeps its slot so they don't
          jump. Phone bar: pinned to the right edge, apart from the centered
          actions. Style ported from Syllert's ScrollToTopButton (brand red
          here): a framed square whose inner fill grows with scroll progress. */}
      <button
        type="button"
        onClick={(e) => {
          toTop();
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
    </div>,
    document.body,
  );
}

export default FloatingActions;
