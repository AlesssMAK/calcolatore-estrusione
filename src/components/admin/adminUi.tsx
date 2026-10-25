// Shared pieces of the admin pages, in the calculator's style: inputs and
// labels as in the form, the action-button pattern (toolBtnCls: an SVG icon on
// phones, + the label on sm+), and one modal for the product / company forms.

import { useEffect, type ReactNode } from 'react';
import { EditIcon, TrashIcon } from '../ActionIcons';
import { toolBtnCls, toolIconCls } from '../toolButton';
import { adminLabelCls } from './adminStyles';

/** A labelled form field (+ optional hint under it). */
export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={adminLabelCls}>{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-ink-soft">{hint}</p>}
    </div>
  );
}

/** Centred card over a dimmed page; scrolls when taller than the screen (a
 *  phone keyboard). Backdrop tap / Esc close it. */
export function AdminModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="mx-auto flex min-h-full max-w-md items-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full rounded-xl bg-white p-5 shadow-xl sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/** A form's buttons: phones — two full-width halves; sm+ — right-aligned. The
 *  primary one submits the form, or calls `onConfirm` when there is no form. */
export function ModalActions({
  onCancel,
  onConfirm,
  busy,
  primary,
  className = 'mt-5',
}: {
  onCancel: () => void;
  onConfirm?: () => void;
  busy: boolean;
  primary: string;
  className?: string;
}) {
  return (
    <div className={`${className} grid grid-cols-2 gap-2 sm:flex sm:justify-end`}>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
      >
        Annulla
      </button>
      <button
        type={onConfirm ? 'button' : 'submit'}
        onClick={onConfirm}
        disabled={busy}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {primary}
      </button>
    </div>
  );
}

/** A list row's ✎ / 🗑 buttons. */
export function RowActions({
  onEdit,
  onDelete,
  disabled,
}: {
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label="Modifica"
        title="Modifica"
        className={toolBtnCls()}
      >
        <EditIcon className={toolIconCls} />
        <span className="hidden sm:inline">Modifica</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label="Elimina"
        title="Elimina"
        className={`${toolBtnCls()} hover:border-danger hover:text-danger`}
      >
        <TrashIcon className={toolIconCls} />
        <span className="hidden sm:inline">Elimina</span>
      </button>
    </div>
  );
}
