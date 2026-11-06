import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { fetchCompanyBySlug } from '../lib/catalog';
import { parseCompanyInput, saveInstalledCompany } from '../lib/installedCompany';

/** "Collega Azienda": the installed app without a company gets one, from its
 *  link or code. It's checked first, then the app reloads on it, as it will at
 *  every launch. */
export default function CompanyConnect({ className }: { className: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <span aria-hidden>🏷</span>
        {t('company.connect')}
      </button>
      {open && <ConnectModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ConnectModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const slug = parseCompanyInput(text);
    if (!slug) {
      setFailed(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    const company = await fetchCompanyBySlug(slug);
    if (company && saveInstalledCompany(company.slug)) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setFailed(true);
  };

  const btn = 'rounded-md border px-3 py-2 text-sm shadow-sm transition';
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('company.connect')}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="px-4 pt-4 pb-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink">{t('company.connect')}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t('company.connectHint')}</p>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-ink-soft">
              {t('company.connectField')}
            </span>
            {/* 16px: an iPhone zooms the page on anything smaller. */}
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFailed(false);
              }}
              disabled={busy}
              aria-invalid={failed}
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-base text-ink shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:opacity-60"
            />
          </label>
          {failed && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              {t('company.connectFailed')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className={`${btn} border-neutral-300 bg-white font-medium text-ink-soft hover:border-neutral-400 hover:text-ink`}
          >
            {t('orders.moveCancel')}
          </button>
          <button
            type="submit"
            disabled={busy || text.trim() === ''}
            className={`${btn} border-brand-600 bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300`}
          >
            {t('company.connectConfirm')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
