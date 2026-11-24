import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFitsInRow } from '../hooks/useFitsInRow';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useCatalog } from '../contexts/CatalogContext';
import { stashOpenSaved } from '../lib/piramidePending';
import type { SavedCalculation } from '../lib/calcHistory';
import { publishSaved, toggleSavedTracking } from '../lib/savedEdit';
import { isSupabaseConfigured } from '../lib/supabase';
import SavedCalculationsButton from './SavedCalculationsButton';
import { CalcIcon, CheckIcon, ProductionIcon } from './ActionIcons';
import { floatBtnCls, type FloatPlacement } from './floatStyles';
import { ScrollTopButton } from './ScrollTopButton';
import { useStartChoice } from '../hooks/useStartChoice';

const btnCls =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 group-data-row/actions:w-auto';

/**
 * The Produzione / Completati pages' buttons, as the form's: back to the
 * calculator, Salvati (a saved calc opens in the calculator) and the other
 * page — in a row when they fit, else a full-width column. While they're out
 * of view: pinned icons (a bottom bar on a phone, a rail on the right wider)
 * over the scroll-to-top. Salvati as the calculator's: 🔄 and 🏭 per calc too.
 */
export default function PageActions({
  other,
  className = '',
  onPublished,
}: {
  /** The other page's button. */
  other: 'produzione' | 'completati';
  className?: string;
  /** A calc was published / taken off from Salvati: the page rereads its list. */
  onPublished?: () => void;
}) {
  const { t } = useTranslation();
  const { company, settings } = useCatalog();
  const retentionDays = settings.savedRetentionDays;
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

  // Bumped after a change in Salvati, so its list rereads.
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const flashNotice = (msg: string, ms = 4000) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), ms);
  };
  // 🔄: fixed ↔ in step with production (a synced copy pushes the change; a
  // view-only follower's copy is detached — said so, as in the calculator).
  const { ask: askStart, modal: startChoiceModal } = useStartChoice();
  const onToggleTracking = async (entry: SavedCalculation) => {
    // ▶ with the line off / warming up on the schedule: now, or next shift?
    const startNow = await askStart(entry, company ? settings : null);
    if (startNow === null) return;
    const done = toggleSavedTracking(entry, company ? settings : null, retentionDays, startNow);
    if (!done) return;
    setRefreshKey((k) => k + 1);
    if (done.push === 'detached') flashNotice(t('company.readOnlySaved'));
  };
  // 🏭: publish to Produzione (view only / editable) or take it off.
  const onPublish = async (entry: SavedCalculation, mode: 'view' | 'edit' | 'off') => {
    if (!company) return;
    const done = await publishSaved(
      entry,
      mode,
      company.slug,
      settings.maxCompanyShared,
      retentionDays,
    );
    if (done.outcome === 'limit') {
      flashNotice(t('company.limitReached', { max: settings.maxCompanyShared }), 3000);
    }
    if (done.outcome !== 'ok') return;
    setRefreshKey((k) => k + 1);
    onPublished?.();
  };
  // The same list in the buttons and in the pinned icons.
  const savedProps = {
    onRestore: (entry: SavedCalculation) => {
      stashOpenSaved(entry.id);
      navigate(`/${search}`);
    },
    onToggleTracking,
    refreshKey,
    onPublish: isSupabaseConfigured && company ? onPublish : undefined,
  };
  const toOther = () => navigate(`/${other}${search}`);
  const otherLabel = t(other === 'completati' ? 'completed.title' : 'production.title');
  const OtherIcon = other === 'completati' ? CheckIcon : ProductionIcon;

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
        <SavedCalculationsButton {...savedProps} />
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
            <SavedCalculationsButton placement={p} {...savedProps} />
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

      {startChoiceModal}

      {notice && (
        <div
          role="alert"
          className="no-print fixed bottom-4 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {notice}
        </div>
      )}
    </>
  );
}
