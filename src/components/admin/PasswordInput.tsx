import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from '../ActionIcons';
import { adminInputCls } from './adminStyles';

/** A password field with an eye to show what was typed (on a phone's small
 *  keyboard a typo is easy). The eye keeps the focus in the field, so the
 *  keyboard stays up. */
export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  className = adminInputCls,
}: {
  id: string;
  /** The field's name for screen readers (its visible label is the caller's). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  const toggle = shown ? 'Nascondi password' : 'Mostra password';
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        aria-label={label}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setShown(s => !s)}
        aria-label={toggle}
        aria-pressed={shown}
        title={toggle}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-ink-soft transition hover:text-brand-600"
      >
        {shown ? (
          <EyeOffIcon className="h-4 w-4" />
        ) : (
          <EyeIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
