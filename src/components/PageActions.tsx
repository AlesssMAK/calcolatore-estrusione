import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFitsInRow } from '../hooks/useFitsInRow';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { stashOpenSaved } from '../lib/piramidePending';
import type { SavedCalculation } from '../lib/calcHistory';
import SavedCalculationsButton from './SavedCalculationsButton';
import { CalcIcon, CheckIcon, FactoryIcon } from './ActionIcons';
import { floatBtnCls, type FloatPlacement } from './floatStyles';
import { ScrollTopButton } from './ScrollTopButton';

const btnCls =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 group-data-row/actions:w-auto';

/**
 * The Produzione / Completati pages' buttons, as the form's: back to the
 * calculator, Salvati (a saved calc opens in the calculator) and the other
 * page — in a row when they fit, else a full-width column. While they're out
 * of view: pinned icons (a bottom bar on a phone, a rail on the right wider)
 * over the scroll-to-top.
 */
export default function PageActions({
  other,
  className = '',
}: {
  /** The other page's button. */
  other: 'produzione' | 'completati';
  className?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const inRow = useFitsInRow(ref, 12);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const p: FloatPlacement = isPhone ? 'bar' : 'rail';

  const toCalculator = () => navigate(`/${search}`);
  const openSaved = (entry: SavedCalculation) => {
    stashOpenSaved(entry.id);
    navigate(`/${search}`);
  };
  const toOther = () => navigate(`/${other}${search}`);
  const otherLabel = t(other === 'completati' ? 'completed.title' : 'production.title');
  const OtherIcon = other === 'completati' ? CheckIcon : FactoryIcon;

  return (
    <>
      <div
        ref={ref}
        data-row={inRow || undefined}
        className={`group/actions no-print flex flex-col gap-2 data-row:flex-row data-row:items-center data-row:justify-end data-row:gap-3 ${className}`}
      >
        <button type="button" onClick={toCalculator} className={btnCls}>
          ← {t('production.toCalculator')}
        </button>
        <SavedCalculationsButton onRestore={openSaved} />
        <button type="button" onClick={toOther} className={btnCls}>
          <OtherIcon className="h-4 w-4" />
          {otherLabel}
        </button>
      </div>

      {createPortal(
        <div
          className={`no-print pointer-events-none fixed z-40 flex gap-2 ${
            p === 'bar'
              ? 'inset-x-0 bottom-0 justify-center px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
              : 'right-3 bottom-4 flex-col justify-end'
          }`}
        >
          <div
            aria-hidden={inView}
            inert={inView}
            data-float-bar={p === 'bar' ? '' : undefined}
            className={`flex gap-2 transition-opacity duration-200 ${p === 'bar' ? '' : 'flex-col'} ${
              !inView ? 'pointer-events-auto opacity-100' : p === 'bar' ? 'hidden' : 'opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={toCalculator}
              title={t('production.toCalculator')}
              aria-label={t('production.toCalculator')}
              className={floatBtnCls()}
            >
              <CalcIcon />
            </button>
            <SavedCalculationsButton placement={p} onRestore={openSaved} />
            <button
              type="button"
              onClick={toOther}
              title={otherLabel}
              aria-label={otherLabel}
              className={floatBtnCls()}
            >
              <OtherIcon />
            </button>
          </div>
          <ScrollTopButton placement={p} />
        </div>,
        document.body,
      )}
    </>
  );
}
