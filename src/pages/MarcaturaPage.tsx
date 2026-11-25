import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import BareButton from '../components/BareButton';
import MarqueeText from '../components/MarqueeText';
import {
  CopyIcon,
  ImportIcon,
  SaveIcon,
  ShareIcon,
  TrashIcon,
} from '../components/ActionIcons';
import { useCatalog } from '../contexts/CatalogContext';
import { useFitsInRow } from '../hooks/useFitsInRow';
import { genId } from '../utils/defaults';
import {
  dataUrlToBlob,
  fillMarking,
  hasOrderSpot,
  loadMyMarkings,
  makeQrPng,
  markingParts,
  MAX_MARKING_NAME,
  MAX_MARKING_TEXT,
  ORDER_TOKEN,
  qrFileName,
  saveMyMarkings,
  type Marking,
} from '../lib/markings';

const cardCls =
  'rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-5';
const h2Cls = 'text-base font-semibold text-ink sm:text-lg';
// 16px on a phone: an iPhone zooms the page on anything smaller.
const fieldCls =
  'w-full rounded-md border border-neutral-300 bg-white px-3 text-base text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:text-sm';
const smallBtnCls =
  'inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50';
const actionCls =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-4 py-2.5 text-sm font-medium shadow-sm transition group-data-row/qr:w-auto';
const primaryCls = `${actionCls} border-brand-600 bg-brand-600 font-semibold text-white hover:bg-brand-700`;
const secondaryCls = `${actionCls} border-neutral-300 bg-white text-ink-soft hover:border-brand-500 hover:text-brand-600`;

/** One marking to pick: its name, and its text under it. */
function MarkingItem({
  marking,
  picked,
  onPick,
  onDelete,
}: {
  marking: Marking;
  picked: boolean;
  onPick: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li
      className={`flex items-center gap-1 rounded-lg border shadow-sm transition ${
        picked
          ? 'border-brand-600 bg-brand-50'
          : 'border-neutral-200 bg-white hover:border-brand-400'
      }`}
    >
      <button
        type="button"
        onClick={onPick}
        aria-pressed={picked}
        className="min-w-0 flex-1 px-3 py-2 text-left"
      >
        <span className="flex min-w-0">
          <MarqueeText
            text={marking.name}
            className="text-sm font-semibold text-ink"
          />
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-soft">
          {marking.text}
        </span>
      </button>
      {onDelete && (
        <BareButton
          title={t('marking.delete')}
          onClick={onDelete}
          className="mr-2"
          iconCls="text-ink-soft group-hover/ib:text-danger group-focus-visible/ib:text-danger"
        >
          <TrashIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        </BareButton>
      )}
    </li>
  );
}

/** The QR's buttons: side by side when they all fit, else a full-width column
 *  (as the app's other rows of buttons). Measured from when it shows. */
function ButtonRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inRow = useFitsInRow(ref, 8);
  return (
    <div
      ref={ref}
      data-row={inRow || undefined}
      className="group/qr mt-4 flex flex-col gap-2 data-row:flex-row data-row:flex-wrap"
    >
      {children}
    </div>
  );
}

/**
 * Marcatura QR: the text the line's marker prints, as a QR code for the order
 * sheet (its scanner reads it there). Picked from the company's standard
 * markings or "Le Mie" (this device), or pasted; its order-number spot filled
 * in. The code is copied (into Excel), downloaded or shared.
 */
export default function MarcaturaPage() {
  const { t } = useTranslation();
  const { company, settings } = useCatalog();
  const homeHref = company
    ? `/?company=${encodeURIComponent(company.slug)}`
    : '/';

  const [text, setText] = useState('');
  const [order, setOrder] = useState('');
  // The marking picked (its name names the file and is offered when saving).
  const [picked, setPicked] = useState<Marking | null>(null);
  const [mine, setMine] = useState<Marking[]>(loadMyMarkings);
  // «Salva nelle Mie» open: the name typed.
  const [saveName, setSaveName] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const orderRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef(0);

  const flash = (msg: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(msg);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  };
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const hasSpot = hasOrderSpot(text);
  const ready = text.trim() !== '' && (!hasSpot || order.trim() !== '');
  const content = ready ? fillMarking(text, order) : '';
  const isPicked = (m: Marking) => picked?.id === m.id && text === m.text;

  // The QR follows what's typed (a moment after the last key).
  useEffect(() => {
    if (!content) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      makeQrPng(content).then(
        url => {
          if (cancelled) return;
          setPng(url);
          setFailed(false);
        },
        () => {
          if (cancelled) return;
          setPng(null);
          setFailed(true);
        }
      );
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content]);
  const shownPng = content ? png : null;

  const fileName = qrFileName(
    order,
    picked && text === picked.text ? picked.name : '',
    content
  );
  const shareFile = useMemo(() => {
    if (!shownPng || typeof navigator.canShare !== 'function') return null;
    const file = new File([dataUrlToBlob(shownPng)], fileName, {
      type: 'image/png',
    });
    return navigator.canShare({ files: [file] }) ? file : null;
  }, [shownPng, fileName]);

  // The field focused in the same tap (rendered at once for it): an iPhone
  // brings its keyboard up only then.
  const pick = (m: Marking) => {
    flushSync(() => {
      setPicked(m);
      setText(m.text);
      setSaveName(null);
    });
    // Only the order number left to type.
    if (hasOrderSpot(m.text)) orderRef.current?.focus();
  };

  const insertOrderSpot = () => {
    const el = textRef.current;
    const at = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    const next = `${text.slice(0, at)}${ORDER_TOKEN}${text.slice(end)}`.slice(
      0,
      MAX_MARKING_TEXT
    );
    flushSync(() => setText(next));
    if (!el) return;
    el.focus();
    const caret = at + ORDER_TOKEN.length;
    el.setSelectionRange(caret, caret);
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const name = (saveName ?? '').trim();
    const body = text.trim();
    if (!name || !body) return;
    const same = mine.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (same && !window.confirm(t('marking.replace', { name: same.name })))
      return;
    const marking: Marking = { id: same?.id ?? genId(), name, text: body };
    const next = same
      ? mine.map(m => (m.id === same.id ? marking : m))
      : [...mine, marking];
    if (!saveMyMarkings(next)) return;
    setMine(next);
    setPicked(marking);
    setText(body);
    setSaveName(null);
    flash(t('marking.saved'));
  };

  const onDelete = (m: Marking) => {
    if (!window.confirm(t('marking.deleteConfirm', { name: m.name }))) return;
    const next = mine.filter(x => x.id !== m.id);
    if (!saveMyMarkings(next)) return;
    setMine(next);
    if (picked?.id === m.id) setPicked(null);
  };

  const copy = async () => {
    if (!shownPng) return;
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('no clipboard');
      }
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': dataUrlToBlob(shownPng) }),
      ]);
      flash(t('marking.copied'));
    } catch {
      flash(t('marking.copyFailed'));
    }
  };

  const download = () => {
    if (!shownPng) return;
    const url = URL.createObjectURL(dataUrlToBlob(shownPng));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const share = async () => {
    if (!shareFile) return;
    try {
      await navigator.share({ files: [shareFile], title: content });
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <Header title={t('marking.title')} homeHref="/" />

      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-8">
        <Link
          to={homeHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
        >
          ← {t('marking.back')}
        </Link>

        {/* What to start from: the company's standard markings, then this
            device's. */}
        <section className={cardCls}>
          <h2 className={h2Cls}>{t('marking.standard')}</h2>
          {settings.markings.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              {t('marking.standardEmpty')}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {settings.markings.map(m => (
                <MarkingItem
                  key={m.id}
                  marking={m}
                  picked={isPicked(m)}
                  onPick={() => pick(m)}
                />
              ))}
            </ul>
          )}

          <h2 className={`${h2Cls} mt-4`}>
            {t('marking.mine')}{' '}
            <span className="text-xs font-normal text-ink-soft">
              {t('marking.mineHint')}
            </span>
          </h2>
          {mine.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              {t('marking.mineEmpty')}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {mine.map(m => (
                <MarkingItem
                  key={m.id}
                  marking={m}
                  picked={isPicked(m)}
                  onPick={() => pick(m)}
                  onDelete={() => onDelete(m)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* The text, its order number. */}
        <section className={cardCls}>
          <label htmlFor="marking-text" className={h2Cls}>
            {t('marking.text')}
          </label>
          <p className="mt-1 text-xs text-ink-soft sm:text-sm">
            {t('marking.textHint')}
          </p>
          <textarea
            id="marking-text"
            ref={textRef}
            rows={3}
            maxLength={MAX_MARKING_TEXT}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('marking.textPlaceholder')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={`${fieldCls} mt-2 resize-none py-2`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={insertOrderSpot}
              title={t('marking.insertOrderHint')}
              className={smallBtnCls}
            >
              <span aria-hidden>+</span>
              {t('marking.insertOrder')}
            </button>
            <button
              type="button"
              onClick={() =>
                setSaveName(picked && text === picked.text ? picked.name : '')
              }
              disabled={text.trim() === '' || saveName !== null}
              className={smallBtnCls}
            >
              <SaveIcon className="h-4 w-4" />
              {t('marking.save')}
            </button>
            {text !== '' && (
              <button
                type="button"
                onClick={() => {
                  setText('');
                  setPicked(null);
                  setSaveName(null);
                }}
                className={smallBtnCls}
              >
                ✕ {t('marking.clear')}
              </button>
            )}
          </div>

          {saveName !== null && (
            <form
              onSubmit={onSave}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input
                type="text"
                autoFocus
                required
                maxLength={MAX_MARKING_NAME}
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder={t('marking.saveNamePlaceholder')}
                aria-label={t('marking.saveName')}
                className={`${fieldCls} h-10 sm:h-9 sm:flex-1`}
              />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => setSaveName(null)}
                  className={smallBtnCls}
                >
                  <span className="mx-auto">{t('marking.cancel')}</span>
                </button>
                <button
                  type="submit"
                  disabled={saveName.trim() === ''}
                  className="rounded-md border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300"
                >
                  {t('marking.saveConfirm')}
                </button>
              </div>
            </form>
          )}

          {hasSpot && (
            <label className="mt-3 block">
              <span className="text-sm font-medium text-ink">
                {t('marking.order')}
              </span>
              <input
                ref={orderRef}
                type="text"
                value={order}
                onChange={e => setOrder(e.target.value)}
                placeholder={t('marking.orderPlaceholder')}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                maxLength={40}
                className={`${fieldCls} mt-1 h-10 sm:h-9`}
              />
            </label>
          )}
        </section>

        {/* The code. */}
        <section className={cardCls} aria-live="polite">
          <h2 className={h2Cls}>{t('marking.qr')}</h2>
          {!ready ? (
            <p className="mt-2 rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm text-ink-soft">
              {t(text.trim() === '' ? 'marking.needText' : 'marking.needOrder')}
            </p>
          ) : failed ? (
            <p
              role="alert"
              className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-danger"
            >
              ⚠ {t('marking.failed')}
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
                <div className="flex h-48 w-48 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white">
                  {shownPng && (
                    <img
                      src={shownPng}
                      alt={t('marking.qr')}
                      className="h-44 w-44 [image-rendering:pixelated]"
                    />
                  )}
                </div>
                <div className="w-full min-w-0 sm:flex-1">
                  <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                    {t('marking.inQr')}
                  </p>
                  <p
                    data-testid="marking-content"
                    className="mt-1 rounded-md bg-neutral-50 px-2 py-1.5 font-mono text-sm break-words whitespace-pre-wrap text-ink"
                  >
                    {markingParts(text.trim(), order).map((part, i) =>
                      part.spot ? (
                        <mark
                          key={i}
                          className="rounded bg-brand-100 px-0.5 font-semibold text-brand-800"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={i}>{part.text}</span>
                      )
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {t('marking.chars', { count: content.length })}
                  </p>
                </div>
              </div>

              <ButtonRow>
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={!shownPng}
                  className={primaryCls}
                >
                  <CopyIcon className="h-4.5 w-4.5" />
                  {t('marking.copy')}
                </button>
                <button
                  type="button"
                  onClick={download}
                  disabled={!shownPng}
                  className={secondaryCls}
                >
                  <ImportIcon className="h-4.5 w-4.5" />
                  {t('marking.download')}
                </button>
                {shareFile && (
                  <button
                    type="button"
                    onClick={() => void share()}
                    className={secondaryCls}
                  >
                    <ShareIcon className="h-4.5 w-4.5" />
                    {t('marking.share')}
                  </button>
                )}
              </ButtonRow>
              <p className="mt-2 text-xs text-ink-soft">
                {t('marking.excelHint')}
              </p>
            </>
          )}
        </section>
      </main>

      {notice && (
        <div
          role="status"
          className="no-print fixed bottom-4 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-ink px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
