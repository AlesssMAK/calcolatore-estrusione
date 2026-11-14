import {
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { get, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { TextModeContext } from '../contexts/textMode';

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === '' ||
  (typeof v === 'number' && Number.isNaN(v));

/**
 * In a tracked calc's form (TextModeContext) a value reads as plain text, with
 * its unit; a tap on it opens its field right there (focused, the keyboard
 * up), and leaving the field turns it back to text. Empty, in error, or in a
 * fresh form: just the field(s). Several fields can share one text (a size's
 * "170 × 6000 mm"): a part marked with data-edit="<field name>" (EditNum)
 * opens on that field.
 */
export default function TapToEdit({
  names,
  render,
  children,
  disabled,
  title,
  className = '',
}: {
  /** The form fields shown by the text. */
  names: string[];
  /** The text, from the fields' values (numbers formatted for the language). */
  render: (values: unknown[], fmt: (n: unknown) => string) => ReactNode;
  /** The field(s) themselves. */
  children: ReactNode;
  /** The fields are locked: the text doesn't open them. */
  disabled?: boolean;
  title?: string;
  /** The text's place / size (grid span, width…). */
  className?: string;
}) {
  'use no memo';
  const textMode = useContext(TextModeContext);
  const { control } = useFormContext();
  const values = useWatch({ control, name: names }) as unknown[];
  const { errors } = useFormState({ control, name: names });
  const { i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inError = names.some((n) => get(errors, n));
  // Leaving the field(s) turns them back to text (a native listener: the
  // wrapper is display: contents).
  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    const onOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) setEditing(false);
    };
    el.addEventListener('focusout', onOut);
    return () => el.removeEventListener('focusout', onOut);
  }, [editing]);
  if (!textMode || editing || inError || values.some(isEmpty)) {
    return (
      <div ref={ref} className="contents">
        {children}
      </div>
    );
  }
  const fmt = (n: unknown) =>
    typeof n === 'number' ? n.toLocaleString(i18n.resolvedLanguage) : String(n ?? '');
  // The field opens and takes the focus in the same tap (so the phone's
  // keyboard comes up).
  const open = (e: ReactMouseEvent<HTMLElement>) => {
    // (nor in a read-only company calc: nothing to edit there)
    if (disabled || e.currentTarget.closest('.calc-readonly')) return;
    const name = (e.target as Element)
      .closest('[data-edit]')
      ?.getAttribute('data-edit');
    flushSync(() => setEditing(true));
    const root = ref.current;
    const field =
      (name && root?.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`)) ||
      root?.querySelector<HTMLElement>('input, select, textarea');
    field?.focus();
  };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      title={title}
      aria-label={title}
      aria-disabled={disabled || undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(e as unknown as ReactMouseEvent<HTMLElement>);
        }
      }}
      className={`flex h-8 min-w-0 items-center gap-1 text-xs text-ink sm:h-9 sm:text-sm ${
        disabled ? 'opacity-40' : 'cursor-text'
      } ${className}`}
    >
      {render(values, fmt)}
    </div>
  );
}
