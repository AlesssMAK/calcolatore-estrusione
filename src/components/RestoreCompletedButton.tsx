import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  count: number;
  /** Restore a single completed order back into the form. */
  onRestoreOne: () => void;
  /** Restore all completed orders back into the form. */
  onRestoreAll: () => void;
}

const HOLD_MS = 800;

/**
 * Restore completed orders back into the form: a quick click restores one, a
 * press-and-hold (~0.8s) restores all. Shown while completed orders are set
 * aside in the advanced view.
 */
function RestoreCompletedButton({ count, onRestoreOne, onRestoreAll }: Props) {
  const { t } = useTranslation();
  const timerRef = useRef<number | null>(null);
  const heldRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const start = () => {
    heldRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      timerRef.current = null;
      onRestoreAll();
    }, HOLD_MS);
  };
  const end = () => {
    const held = heldRef.current;
    clearTimer();
    heldRef.current = false;
    if (!held) onRestoreOne();
  };
  const cancel = () => {
    clearTimer();
    heldRef.current = false;
  };

  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
      <span>✓ {t('advance.completedCount', { n: count })}</span>
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={end}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        title={t('advance.restoreHint')}
        className="inline-flex touch-none items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 font-medium text-ink shadow-sm transition select-none hover:border-brand-500 hover:text-brand-600"
      >
        ↩ {t('advance.restoreCompleted')}
      </button>
      <span className="text-ink-soft/70">{t('advance.restoreHint')}</span>
    </div>
  );
}

export default RestoreCompletedButton;
