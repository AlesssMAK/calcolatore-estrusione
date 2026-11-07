import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalcIcon } from './ActionIcons';

/**
 * Editing a produced count (opened by tapping it): its own full-width line
 * under the label — input, "/ total", the Calcola icon — so it fits a 320px
 * screen. Calcola (or Enter) sets it and recomputes at once; Esc cancels. Its
 * clicks / keys don't reach what it sits in (a card opening on tap / Enter, a
 * modal closing on Esc). Goes inside a <dl>.
 */
export default function ProducedEditor({
  produced,
  total,
  onSave,
  onCancel,
  busy = false,
}: {
  produced: number;
  total: number;
  onSave: (produced: number) => void;
  onCancel: () => void;
  /** The save is on its way: it waits, nothing can be changed. */
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(produced));
  // Focus the count right away — without scrolling the page behind
  // (autoFocus would).
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const n = Number(text);
  const valid = text.trim() !== '' && Number.isFinite(n) && n >= 0;
  const save = () => {
    if (!valid || busy) return;
    onSave(Math.min(Math.round(n), total > 0 ? total : Math.round(n)));
  };
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (!busy) onCancel();
        }
      }}
    >
      <dt className="text-xs tracking-wide text-ink-soft uppercase">
        {t('results.produced')}
      </dt>
      <dd className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min="0"
          max={total > 0 ? total : undefined}
          step="1"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          ref={inputRef}
          aria-label={t('results.produced')}
          className="h-9 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-right text-sm font-semibold text-brand-700 shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:opacity-60"
        />
        <span className="shrink-0 font-semibold text-ink">/ {total}</span>
        <button
          type="button"
          onClick={save}
          disabled={!valid || busy || Number(text) === produced}
          aria-label={t('activeModal.calculate')}
          title={t('activeModal.calculate')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          <CalcIcon />
        </button>
      </dd>
    </div>
  );
}
