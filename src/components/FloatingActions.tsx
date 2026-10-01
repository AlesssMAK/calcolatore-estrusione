import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import SavedCalculationsButton from './SavedCalculationsButton';
import CompanyResultsButton from './CompanyResultsButton';
import type { SavedCalculation } from '../lib/calcHistory';
import type { CompanyCalc } from '../lib/sharedCalc';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ArrowUpIcon, CalcIcon, ResetIcon } from './ActionIcons';
import { floatBtnCls, type FloatPlacement } from './floatStyles';

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
  // Scroll-to-top only once the page has actually been scrolled down.
  const [scrolled, setScrolled] = useState(() => window.scrollY > 200);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 200);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return createPortal(
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`no-print fixed z-40 flex gap-2 transition duration-200 ${
        p === 'bar'
          ? 'inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur'
          : 'right-3 bottom-4 flex-col'
      } ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <button
        type="submit"
        form={formId}
        onClick={onCalculate}
        title={t('actions.calculate')}
        aria-label={t('actions.calculate')}
        className={floatBtnCls(p, true)}
      >
        <CalcIcon />
      </button>
      <button
        type="button"
        onClick={onReset}
        title={t('actions.reset')}
        aria-label={t('actions.reset')}
        className={floatBtnCls(p)}
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
      {/* Set a bit apart from the actions; only when there's something above
          to scroll back to. Rail: `invisible` keeps the slot so the buttons
          above don't jump; phone bar: removed so the others widen. */}
      <button
        type="button"
        onClick={toTop}
        title={t('actions.scrollTop')}
        aria-label={t('actions.scrollTop')}
        tabIndex={scrolled ? undefined : -1}
        className={`${floatBtnCls('rail')} ${p === 'rail' ? 'mt-4' : 'ml-3'} transition-opacity ${
          scrolled
            ? 'opacity-100'
            : p === 'bar'
              ? 'hidden'
              : 'invisible opacity-0'
        }`}
      >
        <ArrowUpIcon />
      </button>
    </div>,
    document.body,
  );
}

export default FloatingActions;
