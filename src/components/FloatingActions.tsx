import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import SavedCalculationsButton from './SavedCalculationsButton';
import CompanyResultsButton from './CompanyResultsButton';
import type { SavedCalculation } from '../lib/calcHistory';
import type { CompanyCalc } from '../lib/sharedCalc';
import { CalcIcon, ResetIcon, SaveIcon } from './ActionIcons';
import { floatBtnCls, type FloatPlacement } from './floatStyles';
import { ScrollTopButton } from './ScrollTopButton';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface Props {
  /** Shown while the form's own action buttons are out of view. Kept mounted
   *  (just hidden) so the Saved / Azienda counts don't refetch on every show. */
  visible: boolean;
  /** id of the <form> the pinned "Calcola" submits (it's portalled out of it). */
  formId: string;
  onCalculate: () => void;
  /** Mirrors the form's "Calcola": inactive when there's nothing to compute. */
  calcDisabled?: boolean;
  /** Read-only company calc: the primary button copies it into Salvati
   *  ("Aggiungi ai Salvati") instead of calculating. */
  onAddToSaved?: () => void;
  onReset: () => void;
  onRestore?: (entry: SavedCalculation) => void;
  onToggleTracking?: (entry: SavedCalculation) => void;
  savedRefreshKey?: number;
  onPublish?: (
    entry: SavedCalculation,
    mode: 'view' | 'edit' | 'off',
  ) => void | Promise<void>;
  onOpenCompany?: (calc: CompanyCalc) => void;
  onDeleteCompany?: (calc: CompanyCalc) => void | Promise<void>;
  onOpenReport?: () => void;
  onToggleCompanyRunning?: (calc: CompanyCalc) => Promise<CompanyCalc | null>;
  onProductionChecked?: () => void;
}

/** Pinned, icon-only copy of the form actions (Calcola / Nuovo / Salvati /
 *  Azienda) + scroll-to-top: a bottom bar on phones, a vertical rail on the
 *  right on wider screens. */
function FloatingActions({
  visible,
  formId,
  onCalculate,
  calcDisabled,
  onAddToSaved,
  onReset,
  onRestore,
  onToggleTracking,
  savedRefreshKey,
  onPublish,
  onOpenCompany,
  onDeleteCompany,
  onOpenReport,
  onToggleCompanyRunning,
  onProductionChecked,
}: Props) {
  const { t } = useTranslation();
  const isPhone = useMediaQuery('(max-width: 639px)');
  const p: FloatPlacement = isPhone ? 'bar' : 'rail';

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
        // Menus elsewhere keep clear of the pinned phone bar (useMenuPlacement).
        data-float-bar={p === 'bar' ? '' : undefined}
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
        {onAddToSaved ? (
          <button
            type="button"
            onClick={onAddToSaved}
            title={t('company.addToSaved')}
            aria-label={t('company.addToSaved')}
            className={floatBtnCls(true)}
          >
            <SaveIcon />
          </button>
        ) : (
          <button
            type="submit"
            form={formId}
            onClick={onCalculate}
            disabled={calcDisabled}
            title={t('actions.calculate')}
            aria-label={t('actions.calculate')}
            className={`${floatBtnCls(true)} disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300`}
          >
            <CalcIcon />
          </button>
        )}
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
            onToggleTracking={onToggleTracking}
            refreshKey={savedRefreshKey}
            onPublish={onPublish}
            onProductionChecked={onProductionChecked}
          />
        )}
        {onOpenCompany && (
          <CompanyResultsButton
            placement={p}
            onOpen={onOpenCompany}
            onDelete={onDeleteCompany}
            refreshKey={savedRefreshKey}
            onOpenReport={onOpenReport}
            onToggleRunning={onToggleCompanyRunning}
          />
        )}
      </div>
      <ScrollTopButton placement={p} />
    </div>,
    document.body,
  );
}

export default FloatingActions;
