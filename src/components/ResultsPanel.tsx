import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CalculatorMode,
  ScheduleResult,
  ScheduledOrder,
  ScheduledSizeDetail,
} from '../types';
import { calculateTotalProfiles, orderSizeList } from '../utils/calculator';
import { useCatalog } from '../contexts/CatalogContext';
import { buildResultPdfBlob, hasProgress } from '../lib/resultPdf';
import { useMenuPlacement } from '../hooks/useMenuPlacement';
import OrderNumberTag from './OrderNumberTag';
import MarqueeText from './MarqueeText';
import { isJumpTap, notePress } from '../utils/tapToJump';
import { blockSpans, sizeGroupEnds, type SpanTotal } from '../utils/spanTotals';
import PauseStrip from './PauseStrip';
import UnitsTimeline from './UnitsTimeline';
import { CollapsibleSchema } from './piramide/PiramideSchemaView';
import {
  formatDateTime,
  formatShortDateTime,
  formatDuration,
} from '../utils/format';

// An order counts as "done" (✓ Completato) either when it was split off as
// already-produced during advance (row.completed), or when it's still in the
// result but fully produced — its whole production time was entered as done, so
// nothing remains. productionMinutes>0 excludes empty rows; a fresh (un-entered)
// order keeps its full remainingMinutes, so this never misfires on it.
function isRowDone(row: ScheduledOrder): boolean {
  return (
    row.completed === true ||
    (row.productionMinutes >= 0.5 && row.remainingMinutes < 0.5)
  );
}

// Same idea for a single size of a multi-size order.
function isSizeDone(sd: ScheduledSizeDetail): boolean {
  return sd.productionMinutes >= 0.5 && sd.remainingMinutes < 0.5;
}

// Small "mark fully produced" button shown per order / per size while tracking
// a saved calc. no-print so it's excluded from the exported image / print.
// The whole-order button is a bit larger than the per-size ones.
function CompleteBtn({
  onClick,
  label,
  big = false,
}: {
  onClick: () => void;
  label: string;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      // Whole-order ✓ is bigger and a stronger green than the per-size ones,
      // so the two read as different actions at a glance.
      className={`no-print inline-flex shrink-0 items-center justify-center rounded border align-middle font-bold text-success transition ${
        big
          ? 'h-6 w-6 border-success bg-success/30 text-[13px] hover:bg-success/40'
          : 'h-5 w-5 border-success/40 bg-success/10 text-[11px] hover:bg-success/20'
      }`}
    >
      ✓
    </button>
  );
}

interface Props {
  result: ScheduleResult;
  mode: CalculatorMode;
  /** Mark an order (or a single size) fully produced. Present only when
   *  tracking a saved/shared calc → renders per-row "✓" buttons. */
  onComplete?: (orderId: string, sizeIdx?: number) => void;
  /** A tap on an order's result: the order in the form. */
  onOpenOrder?: (orderId: string) => void;
  /** A tracked calc: the size in production. Only it shows what's made of it
   *  and its times per pallet — not every size of its order. */
  active?: { orderId: string; sizeIdx: number } | null;
}

function ResultsPanel({ result, mode, onComplete, onOpenOrder, active }: Props) {
  const { t, i18n } = useTranslation();
  // A size's produced block / per-pallet times: in a tracked calc only the
  // size in production's (else every size's, as entered).
  const sizeExtras = (orderId: string | undefined, sIdx: number) =>
    !active || (orderId === active.orderId && sIdx === active.sizeIdx);
  // One handler for all the rows: the tapped one's order (data-result-order).
  const jumpProps = onOpenOrder
    ? {
        onPointerDownCapture: notePress,
        onClick: (e: ReactMouseEvent<HTMLElement>) => {
          const row = (e.target as Element).closest<HTMLElement>(
            '[data-result-order]',
          );
          const id = row?.dataset.resultOrder;
          if (id && isJumpTap(e)) onOpenOrder(id);
        },
      }
    : {};
  const { company } = useCatalog();
  const [exporting, setExporting] = useState(false);
  // Something of it already made → "Condividi" first asks what to share: every
  // order, or only what's left to make.
  const askWhat = hasProgress(result) && result.rows.some((r) => !isRowDone(r));
  const [shareMenu, setShareMenu] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const sharePlace = useMenuPlacement(shareBtnRef, shareMenu, 160);
  useEffect(() => {
    if (!shareMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (!shareRef.current?.contains(e.target as Node)) setShareMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareMenu]);
  // Completed orders are collapsed into one block by default, so the active
  // part of the queue is what stands out. Toggle to reveal them.
  // Every order done (a calc made to the end): the completed ones open.
  const [showCompleted, setShowCompleted] = useState(
    () => result.rows.length > 0 && result.rows.every(isRowDone),
  );
  const doneCount = result.rows.filter(isRowDone).length;
  const sectionRef = useRef<HTMLElement>(null);
  const [now] = useState(() => new Date());
  // The pause after a row (closing its block). Under a folded completed order
  // it still shows while it isn't over (running now / still ahead).
  // A pause "until" a moment already passed shows too (said so), while the
  // order isn't done.
  const pauseShown = (row: ScheduledOrder, done: boolean): boolean =>
    (row.gapAfterMin > 0 &&
      (!done || showCompleted || (row.gapEnd?.getTime() ?? 0) > now.getTime())) ||
    (!!row.gapPassed && !done);

  // Generate a crisp vector PDF of the result and hand it to the user in the
  // most share-friendly way the platform allows:
  //   1. Mobile / share-capable browsers: navigator.share() opens the native
  //      share sheet so they can send the PDF to WhatsApp / email in one tap.
  //   2. Everywhere else: download the .pdf.
  // A PDF (unlike the old PNG) stays sharp at any zoom and is small even for
  // very large results, which was the whole point of switching away from an
  // image screenshot.
  const exportAsPdf = async (remainingOnly = false) => {
    setShareMenu(false);
    setExporting(true);
    try {
      const lang = i18n.resolvedLanguage ?? 'it';
      const blob = await buildResultPdfBlob(result, {
        mode,
        lang,
        units: {
          day: t('units.day'),
          hour: t('units.hour'),
          minute: t('units.minute'),
        },
        t,
        companyName: company?.name,
        remainingOnly,
      });

      const slug = (result.productName || 'risultato')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const stamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[:T]/g, '-');
      const filename = `${slug}-${stamp}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Web Share API — gated by canShare({ files }) since not every Share
      // impl accepts file payloads (desktop Edge / Firefox lie about it).
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: result.productName || t('app.title'),
          });
          return;
        } catch (err) {
          // AbortError = user dismissed the sheet — leave silently. Anything
          // else (permission, transient) → fall through to the download path.
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }

      // Fallback: download the PDF. Revoke after a delay so the browser has
      // time to start the download before the URL is released.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      /* ignore — PDF generation failed */
    } finally {
      setExporting(false);
    }
  };

  const lang = i18n.resolvedLanguage ?? 'it';
  const isProfiles = mode === 'profiles';
  const units = {
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
  };

  const formatLength = (m: number) =>
    m >= 100 ? m.toFixed(0) : m.toFixed(2).replace(/\.?0+$/, '');

  // A size group's / a block's line at its end: what's left of it, and when
  // it ends (none once it's done).
  const spanLine = (label: string, total: SpanTotal) =>
    total.minutes < 0.5 ? null : (
      <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] leading-tight">
        <span className="font-semibold tracking-wide text-ink-soft uppercase">
          {label}
        </span>
        <span className="text-ink-soft">
          <span className="font-semibold text-ink">
            {formatDuration(total.minutes, units)}
          </span>{' '}
          · {t('results.spanEnds', { end: formatShortDateTime(total.end, lang) })}
        </span>
      </span>
    );
  const groupLine = (g: { n: number; title?: string; total: SpanTotal }) =>
    spanLine(g.title ?? t('orders.groupN', { n: g.n }), g.total);

  // For a single-size order, the "count × length" detail to show next to the
  // meters — mirrors what multi-size orders already show per sub-row. Null for
  // total-meters orders and multi-size orders (which break it out per size).
  const sizeSuffixFor = (row: ScheduledOrder): string | null => {
    if (row.order.useTotalLength) return null;
    const sizes = row.order.sizes ?? [];
    if (sizes.length !== 1) return null;
    const sheets = sizes[0]?.sheets;
    const length = sizes[0]?.length;
    if (!sheets || !length) return null;
    return `${sheets}×${length}`;
  };

  // A completed order no longer carries its per-size schedule — its sizes as
  // entered (when there are several: a single one is in the meters column).
  const doneSizesFor = (row: ScheduledOrder) => {
    const sizes = !row.sizeDetails && isRowDone(row) ? orderSizeList(row.order) : [];
    return sizes.length > 1 ? sizes : [];
  };

  const profilesCountFor = (row: ScheduledOrder): number | undefined =>
    isProfiles ? calculateTotalProfiles(row.order) : undefined;

  // Time to produce a single sheet / profile (full production time ÷ total
  // pieces). Exact for single-size orders, an average across sizes otherwise;
  // undefined when the piece count is unknown (total-meters mode).
  const perItemMinFor = (row: ScheduledOrder): number | undefined => {
    // Piece count from the inputs (works in sheets & profiles mode, undefined
    // in total-meters mode) — row.totalSheets/totalProfiles are only set when
    // produced data is entered, so we can't rely on them here.
    const items = calculateTotalProfiles(row.order);
    return items && items > 0 && row.productionMinutes > 0
      ? row.productionMinutes / items
      : undefined;
  };

  const timePerItemLabel = t(
    isProfiles ? 'results.timePerItem.profiles' : 'results.timePerItem.sheets',
  );

  // An order's card and the pause after it (no card for a folded completed
  // order — its pause still, while it isn't over).
  const orderCard = (
    row: ScheduledOrder,
    idx: number,
  ): { card: ReactNode; pause: ReactNode } => {
    const profilesCount = profilesCountFor(row);
    const perItemMin = perItemMinFor(row);
    const done = isRowDone(row);
    // A tap on an order (not on its ✓): it in the form. Not a finished
    // one — the form has it no more.
    const jumpId = onOpenOrder && !done ? row.order.id : undefined;
    const doneSizes = doneSizesFor(row);
    const groupEndAt = sizeGroupEnds(row);
    const pause = pauseShown(row, done) && (
      <li>
        <PauseStrip row={row} now={now} />
      </li>
    );
    if (done && !showCompleted) return { card: null, pause };
    const card = (
      <li
        data-result-order={jumpId}
        title={jumpId ? t('results.openOrder') : undefined}
        className={`rounded-lg border p-3 ${
          done
            ? 'border-success/30 bg-success/5'
            : 'border-neutral-200 bg-surface-alt'
        }`}
      >
        {/* Line one: the order (#N, its number) and the time it takes;
            line two: the product, the whole width for its name. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-7 shrink-0 items-center justify-center rounded-md bg-brand-600 px-2.5 text-xs font-bold text-white">
              #{idx + 1}
            </span>
            <OrderNumberTag value={row.order.orderNumber} />
            {done && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                ✓ {t('results.completed')}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold text-brand-700">
              {formatDuration(row.remainingMinutes, units)}
            </span>
            {onComplete && !done && (
              // Inset by a size card's padding+border (8+1px) so it
              // lines up with the per-size ✓ below, which keep their
              // breathing room from the card border.
              <span className="mr-[9px] flex w-6 justify-center">
                <CompleteBtn
                  big
                  onClick={() => onComplete(row.order.id)}
                  label={t('orders.complete')}
                />
              </span>
            )}
          </div>
        </div>
        {row.order.productName && (
          <div className="mt-1 flex min-w-0">
            <MarqueeText
              text={row.order.productName}
              className="text-sm font-medium text-ink"
            />
          </div>
        )}
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {isProfiles && (
            <>
              <dt className="text-ink-soft">
                {t('results.col.profiles')}
              </dt>
              <dd className="font-medium text-ink">
                {profilesCount ?? '—'}
              </dd>
            </>
          )}
          <dt className="text-ink-soft">{t('results.col.meters')}</dt>
          <dd className="font-medium text-ink">
            {formatLength(row.totalLengthM)} m
            {sizeSuffixFor(row) && (
              <span className="ml-1 font-normal text-ink-soft">
                ({sizeSuffixFor(row)})
              </span>
            )}
          </dd>
          <dt className="text-ink-soft">{t('results.col.speed')}</dt>
          <dd className="font-medium text-ink">{row.speedMPerMin}</dd>
          {perItemMin !== undefined && (
            <>
              <dt className="text-ink-soft">{timePerItemLabel}</dt>
              <dd className="font-medium text-ink">
                {formatDuration(perItemMin, units)}
              </dd>
            </>
          )}
          {isProfiles && (
            <>
              <dt className="text-ink-soft">
                {t('results.col.packages')}
              </dt>
              <dd className="font-medium text-brand-700">
                {row.packages ?? '—'}
              </dd>
            </>
          )}
          <dt className="text-ink-soft">{t('results.col.start')}</dt>
          <dd className="font-medium text-ink">
            {formatShortDateTime(row.start, lang)}
          </dd>
          <dt className="text-ink-soft">{t('results.col.end')}</dt>
          <dd className="font-medium text-ink">
            {formatShortDateTime(row.end, lang)}
          </dd>
        </dl>

        {row.segments && row.segments.length > 1 && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 p-2 text-xs">
            <div className="mb-1 font-semibold text-amber-700">
              {t('results.splitParts', { n: row.segments.length })}
            </div>
            <ol className="space-y-1">
              {row.segments.map((seg, sIdx) => (
                <li
                  key={sIdx}
                  className="rounded border border-amber-100 bg-white/70 p-1.5 tabular-nums"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-amber-700">
                      {t('results.part', { n: sIdx + 1 })}
                    </span>
                    <span className="text-ink-soft">
                      {formatDuration(seg.minutes, units)}
                    </span>
                  </div>
                  <div className="text-ink-soft">
                    {formatShortDateTime(seg.start, lang)} –{' '}
                    {formatShortDateTime(seg.end, lang)}
                  </div>
                  <div>
                    <span className="font-medium text-ink">
                      {formatLength(seg.metersM)} m
                    </span>
                    {seg.pieces !== undefined && (
                      <span className="text-ink-soft">
                        {' · '}
                        {seg.pieces}{' '}
                        {isProfiles
                          ? t('results.col.profiles').toLowerCase()
                          : t('results.col.sheets').toLowerCase()}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {row.sizeDetails && row.sizeDetails.length > 1 && (
          <ul className="mt-2 space-y-1.5">
            {row.sizeDetails.map((sd, sIdx) => {
              // Hide the "produced X/X" block for a finished size — the
              // ✓ already marks it done.
              const extras = sizeExtras(row.order?.id, sIdx);
              const hasProducedAtSize =
                extras &&
                (sd.producedProfiles !== undefined ||
                  sd.producedSheetsAtSize !== undefined) &&
                !isSizeDone(sd);
              const gEnd = groupEndAt.get(sIdx);
              const gLine = gEnd && groupLine(gEnd);
              return (
                <Fragment key={sIdx}>
                <li className="rounded-md border border-neutral-200 bg-white p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-brand-700">
                      ↳ #{idx + 1}.{sIdx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">
                        {formatDuration(sd.remainingMinutes, units)}
                      </span>
                      {onComplete && !isSizeDone(sd) && (
                        // Same w-6 slot as the order button (which is
                        // inset by this card's padding+border) so all
                        // ✓ line up in one column.
                        <span className="flex w-6 justify-center">
                          <CompleteBtn
                            onClick={() =>
                              onComplete(row.order.id, sIdx)
                            }
                            label={t('orders.complete')}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt className="text-ink-soft">
                      {isProfiles
                        ? t('results.col.profiles')
                        : t('results.col.sheets')}
                    </dt>
                    <dd className="font-medium text-ink">
                      {sd.sheets} × {sd.length} mm
                    </dd>
                    <dt className="text-ink-soft">
                      {t('results.col.meters')}
                    </dt>
                    <dd className="font-medium text-ink">
                      {formatLength(sd.metersM)} m
                    </dd>
                    {isProfiles && sd.packages !== undefined && (
                      <>
                        <dt className="text-ink-soft">
                          {t('results.col.packages')}
                        </dt>
                        <dd className="font-medium text-brand-700">
                          {sd.packages}
                          {sd.perPackage !== undefined && (
                            <span className="ml-1 text-ink-soft">
                              (× {sd.perPackage})
                            </span>
                          )}
                        </dd>
                      </>
                    )}
                    <dt className="text-ink-soft">
                      {t('results.col.start')}
                    </dt>
                    <dd className="font-medium text-ink">
                      {formatShortDateTime(sd.start, lang)}
                    </dd>
                    <dt className="text-ink-soft">
                      {t('results.col.end')}
                    </dt>
                    <dd className="font-medium text-ink">
                      {formatShortDateTime(sd.end, lang)}
                    </dd>
                  </dl>
                  {hasProducedAtSize && (
                    <SizeProducedBlock sd={sd} t={t} mode={mode} />
                  )}
                  {extras &&
                    sd.timePerUnitMin !== undefined &&
                    sd.totalUnits !== undefined && (
                      <PerUnitBlock
                        start={sd.start}
                        end={sd.end}
                        timePerUnitMin={sd.timePerUnitMin}
                        totalUnits={sd.totalUnits}
                        producedMinutes={
                          sd.productionMinutes - sd.remainingMinutes
                        }
                        mode={mode}
                        windows={row.segments}
                        t={t}
                      />
                    )}
                </li>
                {(((sd.gapAfterMin ?? 0) > 0 &&
                  (!isSizeDone(sd) || (sd.gapEnd?.getTime() ?? 0) > now.getTime())) ||
                  (!!sd.gapPassed && !isSizeDone(sd))) && (
                  // The stop after this size, before the order's next one.
                  <li>
                    <PauseStrip row={row} now={now} sizeIdx={sIdx} />
                  </li>
                )}
                {gLine && (
                  <li className="rounded-md border border-dashed border-neutral-300 px-2 py-1">
                    {gLine}
                  </li>
                )}
                </Fragment>
              );
            })}
          </ul>
        )}

        {doneSizes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {doneSizes.map((s, sIdx) => (
              <li
                key={sIdx}
                className="flex items-center justify-between gap-2 rounded-md border border-success/20 bg-white px-2 py-1.5 text-xs"
              >
                <span className="font-semibold text-brand-700">
                  ↳ #{idx + 1}.{sIdx + 1}
                </span>
                <span className="font-medium text-ink">
                  {s.sheets} × {s.length} mm
                  <span className="ml-1 font-normal text-ink-soft">
                    · {formatLength(s.metersM)} m
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {!row.sizeDetails &&
          (row.producedProfiles !== undefined ||
            row.producedSheets !== undefined) && (
            <ProducedRemainingBlock row={row} t={t} mode={mode} />
          )}
        {!row.sizeDetails &&
          row.timePerUnitMin !== undefined &&
          row.totalUnits !== undefined && (
            <PerUnitBlock
              start={row.start}
              end={row.end}
              timePerUnitMin={row.timePerUnitMin}
              totalUnits={row.totalUnits}
              producedMinutes={
                row.productionMinutes - row.remainingMinutes
              }
              mode={mode}
              windows={row.segments}
              t={t}
            />
          )}
      </li>
    );
    return { card, pause };
  };

  // The cards: a block's orders (two or more) in one frame, its time and end
  // at its foot, the pause that closes it after the frame.
  const spanAt = new Map(blockSpans(result.rows).map((s) => [s.rows[0], s]));
  const cards: ReactNode[] = [];
  for (let i = 0; i < result.rows.length; ) {
    const span = spanAt.get(i);
    if (!span) {
      const { card, pause } = orderCard(result.rows[i], i);
      cards.push(
        <Fragment key={result.rows[i].order.id}>
          {card}
          {pause}
        </Fragment>,
      );
      i += 1;
      continue;
    }
    const parts = span.rows.map((j) => ({
      id: result.rows[j].order.id,
      ...orderCard(result.rows[j], j),
    }));
    const line = spanLine(t('orders.block', { n: span.n }), span.total);
    cards.push(
      <Fragment key={`block-${parts[0].id}`}>
        <li className="space-y-2 rounded-xl border border-dashed border-neutral-300 p-2 sm:p-3">
          <ul className="space-y-2">
            {parts.map((p) => (
              <Fragment key={p.id}>{p.card}</Fragment>
            ))}
          </ul>
          {line && <div className="px-1">{line}</div>}
        </li>
        {parts[parts.length - 1].pause}
      </Fragment>,
    );
    i = span.rows[span.rows.length - 1] + 1;
  }

  return (
    <section
      ref={sectionRef}
      data-print="results"
      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 print:border-0 print:shadow-none"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink sm:text-lg">
            {t('results.title')}
          </h2>
          {result.productName && (
            <p className="mt-0.5 flex min-w-0 items-center text-sm font-medium text-brand-700">
              <span aria-hidden className="mr-1 shrink-0">🏷</span>
              <MarqueeText text={result.productName} />
            </p>
          )}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm transition hover:border-brand-500 hover:text-brand-600"
          >
            🖨 {t('actions.print')}
          </button>
          <div ref={shareRef} className="relative">
            <button
              ref={shareBtnRef}
              type="button"
              onClick={() => {
                if (!askWhat) {
                  void exportAsPdf();
                  return;
                }
                if (!shareMenu) sharePlace.measure();
                setShareMenu((v) => !v);
              }}
              disabled={exporting}
              aria-haspopup={askWhat ? 'menu' : undefined}
              aria-expanded={askWhat ? shareMenu : undefined}
              className="rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 shadow-sm transition hover:border-brand-500 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              📄 {exporting ? t('actions.exporting') : t('actions.shareResult')}
            </button>
            {shareMenu && (
              <div
                role="menu"
                aria-label={t('actions.shareWhat')}
                className={`absolute right-0 z-30 ${
                  sharePlace.up ? 'bottom-full mb-2' : 'mt-2'
                } w-60 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg`}
                style={{ maxHeight: sharePlace.maxHeight }}
              >
                <div className="px-2 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                  {t('actions.shareWhat')}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportAsPdf()}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-ink transition hover:bg-brand-50"
                >
                  <span aria-hidden>📋</span>
                  {t('actions.shareAll')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportAsPdf(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-ink transition hover:bg-brand-50"
                >
                  <span aria-hidden>⏳</span>
                  {t('actions.shareRemaining')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryItem
          icon="⏱"
          label={t('results.totalProduction')}
          value={formatDuration(result.totalProductionMinutes, units)}
          accent
        />
        {result.totalGapMinutes > 0 && (
          <SummaryItem
            icon="⏸"
            label={t('results.totalGap')}
            value={formatDuration(result.totalGapMinutes, units)}
          />
        )}
        <SummaryItem
          icon="📊"
          label={t('results.totalDuration')}
          value={formatDuration(result.totalDurationMinutes, units)}
        />
        <SummaryItem
          icon="🏁"
          label={t('results.endAt')}
          value={formatDateTime(result.endAt, lang)}
          accent
        />
        {isProfiles && result.totalPackages !== undefined && (
          <SummaryItem
            icon="📦"
            label={t('results.totalPackages')}
            value={String(result.totalPackages)}
            accent
          />
        )}
      </dl>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          {t('results.breakdown')}
        </h3>

        {/* Cards, on every screen (no table). */}
        <ul className="space-y-2" {...jumpProps}>
          {doneCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
                className="flex w-full items-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-left text-sm font-medium text-success"
              >
                <span aria-hidden>{showCompleted ? '▾' : '▸'}</span>
                <span>✓ {t('results.completedGroup', { n: doneCount })}</span>
              </button>
            </li>
          )}
          {cards}
        </ul>
      </div>

      {result.rows.some((r) => r.order.piramideSchema) && (
        <div className="mt-4 space-y-2">
          {result.rows
            .filter((r) => r.order.piramideSchema)
            .map((r) => (
              <div key={r.order.id}>
                {r.order.productName && (
                  <div className="text-xs font-semibold text-brand-700">
                    {r.order.productName}
                  </div>
                )}
                <CollapsibleSchema schema={r.order.piramideSchema} />
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

function SizeProducedBlock({
  sd,
  t,
  mode,
}: {
  sd: ScheduledSizeDetail;
  t: ReturnType<typeof useTranslation>['t'];
  mode: CalculatorMode;
}) {
  const isProfiles = mode === 'profiles';
  return (
    // Shown only for a size that's partly produced (in production) → blinks.
    <div className="active-blink mt-1.5 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs">
      {isProfiles && sd.producedProfiles !== undefined && (
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5">
          <dt className="text-ink-soft">
            {t('orders.advanced.profilesProduced')}
          </dt>
          <dd className="font-medium text-ink">
            <span className="num-blink">{sd.producedProfiles}</span>
            <span className="text-ink-soft"> / {sd.sheets}</span>
          </dd>
          <dd className="text-right font-semibold text-brand-700">
            ↓ {sd.remainingProfiles ?? 0}
          </dd>
          {sd.producedPackages !== undefined && (
            <>
              <dt className="text-ink-soft">
                {t('orders.advanced.packagesProduced')}
              </dt>
              <dd className="font-medium text-ink">
                {sd.producedPackages}
                {sd.packages !== undefined && (
                  <span className="text-ink-soft"> / {sd.packages}</span>
                )}
              </dd>
              <dd className="text-right font-semibold text-brand-700">
                {sd.remainingPackages !== undefined
                  ? `↓ ${sd.remainingPackages}`
                  : '—'}
              </dd>
            </>
          )}
        </dl>
      )}
      {!isProfiles && sd.producedSheetsAtSize !== undefined && (
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5">
          <dt className="text-ink-soft">
            {t('orders.advanced.sheetsProduced')}
          </dt>
          <dd className="font-medium text-ink">
            <span className="num-blink">{sd.producedSheetsAtSize}</span>
            <span className="text-ink-soft"> / {sd.sheets}</span>
          </dd>
          <dd className="text-right font-semibold text-brand-700">
            ↓ {sd.remainingSheetsAtSize ?? 0}
          </dd>
          {sd.producedPalletsAtSize !== undefined && (
            <>
              <dt className="text-ink-soft">
                {t('orders.advanced.palletsProduced')}
              </dt>
              <dd className="font-medium text-ink">
                {sd.producedPalletsAtSize}
                {sd.sheetsPerPalletAtSize !== undefined && (
                  <span className="text-ink-soft">
                    {' '}
                    (× {sd.sheetsPerPalletAtSize})
                  </span>
                )}
              </dd>
              <dd className="text-right font-semibold text-brand-700">
                {sd.remainingPalletsAtSize !== undefined
                  ? `↓ ${sd.remainingPalletsAtSize}`
                  : '—'}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? 'rounded-lg border border-brand-200 bg-brand-50 p-3'
          : 'rounded-lg border border-neutral-200 bg-surface-alt p-3'
      }
    >
      <dt className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
        <span aria-hidden>{icon}</span>
        {label}
      </dt>
      <dd
        className={
          accent
            ? 'mt-1 text-lg font-bold text-brand-700'
            : 'mt-1 text-lg font-semibold text-ink'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ProducedRemainingBlock({
  row,
  t,
  mode,
}: {
  row: ScheduledOrder;
  t: ReturnType<typeof useTranslation>['t'];
  mode: CalculatorMode;
}) {
  const isProfiles = mode === 'profiles';
  // Still producing → the block and its produced count blink.
  const inProgress = row.remainingMinutes >= 0.5;
  const units = {
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
  };
  return (
    <div
      className={`mt-2 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs ${
        inProgress ? 'active-blink' : ''
      }`}
    >
      {isProfiles && row.producedProfiles !== undefined && (
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1">
          <dt className="text-ink-soft">{t('orders.advanced.profilesProduced')}</dt>
          <dd className="font-medium text-ink">
            <span className={inProgress ? 'num-blink' : undefined}>
              {row.producedProfiles}
            </span>
            {row.totalProfiles !== undefined && (
              <span className="text-ink-soft"> / {row.totalProfiles}</span>
            )}
          </dd>
          <dd className="text-right font-semibold text-brand-700">
            {row.remainingProfiles !== undefined
              ? `↓ ${row.remainingProfiles}`
              : '—'}
          </dd>

          {row.producedPackages !== undefined && (
            <>
              <dt className="text-ink-soft">
                {t('orders.advanced.packagesProduced')}
              </dt>
              <dd className="font-medium text-ink">
                {row.producedPackages}
                {row.packages !== undefined && (
                  <span className="text-ink-soft"> / {row.packages}</span>
                )}
              </dd>
              <dd className="text-right font-semibold text-brand-700">
                {row.remainingPackages !== undefined
                  ? `↓ ${row.remainingPackages}`
                  : '—'}
              </dd>
            </>
          )}
        </dl>
      )}

      {!isProfiles && row.producedSheets !== undefined && (
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1">
          <dt className="text-ink-soft">
            {t('orders.advanced.sheetsProduced')}
          </dt>
          <dd className="font-medium text-ink">
            <span className={inProgress ? 'num-blink' : undefined}>
              {row.producedSheets}
            </span>
            {row.totalSheets !== undefined && (
              <span className="text-ink-soft"> / {row.totalSheets}</span>
            )}
          </dd>
          <dd className="text-right font-semibold text-brand-700">
            {row.remainingSheets !== undefined
              ? `↓ ${row.remainingSheets}`
              : '—'}
          </dd>

          {row.producedPallets !== undefined && (
            <>
              <dt className="text-ink-soft">
                {t('orders.advanced.palletsProduced')}
              </dt>
              <dd className="font-medium text-ink">{row.producedPallets}</dd>
              <dd className="text-right font-semibold text-brand-700">
                {row.remainingPallets !== undefined
                  ? `↓ ${row.remainingPallets}`
                  : '—'}
              </dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-brand-200 pt-1.5">
        <span className="text-ink-soft">{t('results.timeToFinish')}</span>
        <span className="font-semibold text-brand-700">
          {formatDuration(row.remainingMinutes, units)}
        </span>
      </div>
    </div>
  );
}

function PerUnitBlock({
  start,
  end,
  timePerUnitMin,
  totalUnits,
  producedMinutes,
  mode,
  windows,
  t,
}: {
  start: Date;
  end: Date;
  timePerUnitMin: number;
  totalUnits: number;
  producedMinutes: number;
  mode: CalculatorMode;
  /** The order's productive windows (row.segments) — see UnitsTimeline. */
  windows?: ReadonlyArray<{ start: Date; end: Date }>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const kind: 'pallet' | 'package' = mode === 'profiles' ? 'package' : 'pallet';
  const units = {
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
  };
  return (
    // Neutral (not the brand-pink "in production" look of the produced block).
    <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-ink-soft">
          {t(`results.${kind}.timePerOne`)}
        </span>
        <span className="font-semibold text-ink">
          {formatDuration(timePerUnitMin, units)}
        </span>
      </div>
      <UnitsTimeline
        start={start}
        end={end}
        timePerUnitMin={timePerUnitMin}
        totalUnits={totalUnits}
        producedMinutes={producedMinutes}
        kind={kind}
        windows={windows}
      />
    </div>
  );
}

export default ResultsPanel;
