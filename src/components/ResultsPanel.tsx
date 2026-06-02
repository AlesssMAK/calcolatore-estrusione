import { Fragment, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toBlob } from 'html-to-image';
import type {
  CalculatorMode,
  ScheduleResult,
  ScheduledOrder,
  ScheduledSizeDetail,
} from '../types';
import { calculateTotalProfiles } from '../utils/calculator';
import UnitsTimeline from './UnitsTimeline';
import {
  formatDateTime,
  formatShortDateTime,
  formatDuration,
} from '../utils/format';

interface Props {
  result: ScheduleResult;
  mode: CalculatorMode;
  onReset: () => void;
}

function ResultsPanel({ result, mode, onReset }: Props) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  // Build the PNG of the results panel and surface it to the user in the
  // most share-friendly way the platform allows:
  //   1. Mobile / share-capable browsers: navigator.share() opens the
  //      native share sheet so the user can hand the file to WhatsApp /
  //      Telegram / email in one tap.
  //   2. Everywhere else: open the blob URL in a new tab. The user can
  //      then drag-and-drop into a chat, right-click → Save as, or
  //      screenshot it — friendlier than a silent download on desktop.
  const exportAsImage = async () => {
    const node = sectionRef.current;
    if (!node) return;
    setExporting(true);
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        // Skip toolbar buttons (Print / Copy / Reset / Save image)
        filter: (n) =>
          !(n instanceof HTMLElement && n.classList.contains('no-print')),
      });
      if (!blob) return;

      const slug = (result.productName || 'risultato')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const stamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[:T]/g, '-');
      const filename = `${slug}-${stamp}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      // Web Share API — only available in secure contexts and (importantly)
      // gated by canShare({ files }) since not every Share impl accepts
      // file payloads (desktop Edge / Firefox lie about navigator.share).
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
          // AbortError = user dismissed the sheet — that's fine, no
          // fallback. Anything else (permission, transient) → fall through
          // to the new-tab path so the image isn't lost.
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }

      // Fallback: open the PNG in a new tab. Revoke after a delay so the
      // tab has time to fetch it; immediately revoking would race the load.
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      /* ignore — capture itself failed (oversize node, etc.) */
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

  const profilesCountFor = (row: ScheduledOrder): number | undefined =>
    isProfiles ? calculateTotalProfiles(row.order) : undefined;

  const buildPlainText = () => {
    const lines: string[] = [];
    lines.push(t('app.title'));
    if (result.productName) {
      lines.push(`${t('settings.productName')}: ${result.productName}`);
    }
    lines.push('');
    lines.push(
      `${t('results.totalProduction')}: ${formatDuration(result.totalProductionMinutes, units)}`,
    );
    if (result.totalGapMinutes > 0) {
      lines.push(
        `${t('results.totalGap')}: ${formatDuration(result.totalGapMinutes, units)}`,
      );
    }
    lines.push(
      `${t('results.totalDuration')}: ${formatDuration(result.totalDurationMinutes, units)}`,
    );
    lines.push(`${t('results.endAt')}: ${formatDateTime(result.endAt, lang)}`);
    if (isProfiles && result.totalPackages !== undefined) {
      lines.push(`${t('results.totalPackages')}: ${result.totalPackages}`);
    }
    lines.push('');
    lines.push(t('results.breakdown'));

    result.rows.forEach((row, idx) => {
      const meters = `${formatLength(row.totalLengthM)} m`;
      const profilesCount = profilesCountFor(row);
      const head =
        profilesCount !== undefined
          ? `${profilesCount} ${t('results.col.profiles').toLowerCase()}, ${meters}`
          : meters;
      const pkgPart =
        isProfiles && row.packages !== undefined
          ? `  →  ${row.packages} ${t('results.col.packages').toLowerCase()}`
          : '';
      const namePart = row.order.productName
        ? ` ${row.order.productName}`
        : '';
      lines.push(
        `#${idx + 1}${namePart}  ${head}  @ ${row.speedMPerMin} m/min  →  ${formatDuration(row.remainingMinutes, units)}  (${formatShortDateTime(row.start, lang)} – ${formatShortDateTime(row.end, lang)})${pkgPart}`,
      );

      if (row.sizeDetails && row.sizeDetails.length > 1) {
        row.sizeDetails.forEach((sd, sIdx) => {
          const sdMeters = `${formatLength(sd.metersM)} m`;
          const sdPkg =
            isProfiles && sd.packages !== undefined
              ? `  →  ${sd.packages} ${t('results.col.packages').toLowerCase()}`
              : '';
          const sdHead = isProfiles
            ? `${sd.sheets} prof. × ${sd.length} mm`
            : `${sd.sheets} pz × ${sd.length} mm`;
          lines.push(
            `   ↳ #${idx + 1}.${sIdx + 1}  ${sdHead}  ${sdMeters}  →  ${formatDuration(sd.remainingMinutes, units)}  (${formatShortDateTime(sd.start, lang)} – ${formatShortDateTime(sd.end, lang)})${sdPkg}`,
          );
          // Per-size produced/remaining line.
          const subParts: string[] = [];
          if (sd.producedProfiles !== undefined) {
            subParts.push(
              `${t('results.produced')}: ${sd.producedProfiles}/${sd.sheets} prof.`,
            );
            if (sd.producedPackages !== undefined) {
              subParts.push(
                `${sd.producedPackages}${sd.packages !== undefined ? `/${sd.packages}` : ''} pacchi`,
              );
            }
            if (sd.remainingProfiles !== undefined) {
              subParts.push(`${t('results.remaining')}: ${sd.remainingProfiles}`);
            }
          }
          if (sd.producedSheetsAtSize !== undefined) {
            subParts.push(
              `${t('results.produced')}: ${sd.producedSheetsAtSize}/${sd.sheets} pz.`,
            );
            if (sd.producedPalletsAtSize !== undefined) {
              subParts.push(`${sd.producedPalletsAtSize} bancali`);
            }
            if (sd.remainingSheetsAtSize !== undefined) {
              subParts.push(
                `${t('results.remaining')}: ${sd.remainingSheetsAtSize}`,
              );
            }
          }
          if (subParts.length > 0) {
            subParts.push(
              `${t('results.timeToFinish')}: ${formatDuration(sd.remainingMinutes, units)}`,
            );
            lines.push(`        ${subParts.join(' · ')}`);
          }
        });
      }

      const showAggregateProduced =
        !(row.sizeDetails && row.sizeDetails.length > 1) &&
        (row.producedProfiles !== undefined ||
          row.producedSheets !== undefined);

      if (showAggregateProduced) {
        const parts: string[] = [];
        if (row.producedProfiles !== undefined) {
          parts.push(
            `${t('results.produced')}: ${row.producedProfiles}/${row.totalProfiles ?? '?'} prof.`,
          );
          if (row.producedPackages !== undefined) {
            parts.push(`${row.producedPackages} pacchi`);
          }
          if (row.remainingProfiles !== undefined) {
            parts.push(`${t('results.remaining')}: ${row.remainingProfiles}`);
          }
        }
        if (row.producedSheets !== undefined) {
          parts.push(
            `${t('results.produced')}: ${row.producedSheets}${row.totalSheets ? `/${row.totalSheets}` : ''} pz.`,
          );
          if (row.producedPallets !== undefined) {
            parts.push(`${row.producedPallets} bancali`);
          }
          if (row.remainingSheets !== undefined) {
            parts.push(`${t('results.remaining')}: ${row.remainingSheets}`);
          }
        }
        parts.push(
          `${t('results.timeToFinish')}: ${formatDuration(row.remainingMinutes, units)}`,
        );
        if (parts.length > 0) {
          lines.push(`     ${parts.join(' · ')}`);
        }
      }
    });

    return lines.join('\n');
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

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
            <p className="mt-0.5 truncate text-sm font-medium text-brand-700">
              <span aria-hidden className="mr-1">🏷</span>
              {result.productName}
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
          <button
            type="button"
            onClick={() => void exportAsImage()}
            disabled={exporting}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            📷 {exporting ? t('actions.exporting') : t('actions.saveImage')}
          </button>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm transition hover:border-brand-500 hover:text-brand-600"
          >
            📋 {copied ? t('actions.copied') : t('actions.copy')}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md bg-ink-soft px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ink"
          >
            ↺ {t('actions.reset')}
          </button>
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

        {/* Mobile: stacked cards */}
        <ul className="space-y-2 sm:hidden">
          {result.rows.map((row, idx) => {
            const profilesCount = profilesCountFor(row);
            return (
              <li
                key={row.order.id}
                className="rounded-lg border border-neutral-200 bg-surface-alt p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 shrink-0 items-center justify-center rounded-md bg-brand-600 px-2.5 text-xs font-bold text-white">
                      #{idx + 1}
                    </span>
                    {row.order.productName && (
                      <span className="truncate text-xs font-medium text-ink">
                        {row.order.productName}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-brand-700">
                    {formatDuration(row.remainingMinutes, units)}
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
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
                  </dd>
                  <dt className="text-ink-soft">{t('results.col.speed')}</dt>
                  <dd className="font-medium text-ink">{row.speedMPerMin}</dd>
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

                {row.sizeDetails && row.sizeDetails.length > 1 && (
                  <ul className="mt-2 space-y-1.5">
                    {row.sizeDetails.map((sd, sIdx) => {
                      const hasProducedAtSize =
                        sd.producedProfiles !== undefined ||
                        sd.producedSheetsAtSize !== undefined;
                      return (
                        <li
                          key={sIdx}
                          className="rounded-md border border-neutral-200 bg-white p-2 text-xs"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-semibold text-brand-700">
                              ↳ #{idx + 1}.{sIdx + 1}
                            </span>
                            <span className="font-semibold text-ink">
                              {formatDuration(sd.remainingMinutes, units)}
                            </span>
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
                          {sd.timePerUnitMin !== undefined &&
                            sd.totalUnits !== undefined && (
                              <PerUnitBlock
                                start={sd.start}
                                timePerUnitMin={sd.timePerUnitMin}
                                totalUnits={sd.totalUnits}
                                mode={mode}
                                t={t}
                              />
                            )}
                        </li>
                      );
                    })}
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
                      timePerUnitMin={row.timePerUnitMin}
                      totalUnits={row.totalUnits}
                      mode={mode}
                      t={t}
                    />
                  )}
              </li>
            );
          })}
        </ul>

        {/* Desktop: table */}
        <div className="hidden sm:block sm:overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
                <th className="py-2 pr-3">{t('results.col.number')}</th>
                {isProfiles && (
                  <th className="py-2 pr-3">{t('results.col.profiles')}</th>
                )}
                <th className="py-2 pr-3">{t('results.col.meters')}</th>
                <th className="py-2 pr-3">{t('results.col.speed')}</th>
                <th className="py-2 pr-3">{t('results.col.productionTime')}</th>
                {isProfiles && (
                  <th className="py-2 pr-3">{t('results.col.packages')}</th>
                )}
                <th className="py-2 pr-3">{t('results.col.start')}</th>
                <th className="py-2">{t('results.col.end')}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, idx) => {
                const profilesCount = profilesCountFor(row);
                const hasProduced =
                  row.producedProfiles !== undefined ||
                  row.producedSheets !== undefined;
                const colSpan = isProfiles ? 8 : 6;
                const hasSizeBreakdown =
                  row.sizeDetails !== undefined &&
                  row.sizeDetails.length > 1;
                // When sizes are broken out, hide the aggregate produced
                // block and show per-size produced inside each sub-row.
                const showAggregateProduced = hasProduced && !hasSizeBreakdown;
                const hasRowPerUnit =
                  !hasSizeBreakdown && row.timePerUnitMin !== undefined;
                const mainRowBorder =
                  showAggregateProduced || hasSizeBreakdown || hasRowPerUnit
                    ? 'border-b-0'
                    : 'border-b border-neutral-100 last:border-b-0';
                return (
                  <Fragment key={row.order.id}>
                    <tr className={mainRowBorder}>
                      <td className="py-2 pr-3 font-semibold text-brand-600 whitespace-nowrap">
                        #{idx + 1}
                        {row.order.productName && (
                          <span className="ml-2 font-medium text-ink">
                            {row.order.productName}
                          </span>
                        )}
                      </td>
                      {isProfiles && (
                        <td className="py-2 pr-3">{profilesCount ?? '—'}</td>
                      )}
                      <td className="py-2 pr-3">
                        {formatLength(row.totalLengthM)} m
                      </td>
                      <td className="py-2 pr-3">{row.speedMPerMin}</td>
                      <td className="py-2 pr-3 font-medium">
                        {formatDuration(row.remainingMinutes, units)}
                      </td>
                      {isProfiles && (
                        <td className="py-2 pr-3 font-medium text-brand-700">
                          {row.packages ?? '—'}
                        </td>
                      )}
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatShortDateTime(row.start, lang)}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        {formatShortDateTime(row.end, lang)}
                      </td>
                    </tr>
                    {hasSizeBreakdown &&
                      row.sizeDetails!.map((sd, sIdx) => {
                        const isLastSub =
                          sIdx === row.sizeDetails!.length - 1;
                        const hasProducedAtSize =
                          sd.producedProfiles !== undefined ||
                          sd.producedSheetsAtSize !== undefined;
                        return (
                          <Fragment key={sIdx}>
                            <tr
                              className={
                                hasProducedAtSize
                                  ? 'border-b-0 bg-brand-50/30 text-xs text-ink-soft'
                                  : isLastSub
                                    ? 'border-b border-neutral-100 bg-brand-50/30 text-xs text-ink-soft last:border-b-0'
                                    : 'border-b-0 bg-brand-50/30 text-xs text-ink-soft'
                              }
                            >
                              <td className="py-1.5 pr-3 pl-4 font-medium whitespace-nowrap">
                                ↳ #{idx + 1}.{sIdx + 1}
                              </td>
                              {isProfiles && (
                                <td className="py-1.5 pr-3">{sd.sheets}</td>
                              )}
                              <td className="py-1.5 pr-3">
                                {formatLength(sd.metersM)} m
                                <span className="ml-1 text-ink-soft">
                                  ({sd.sheets}×{sd.length})
                                </span>
                              </td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 pr-3 font-medium text-ink">
                                {formatDuration(sd.remainingMinutes, units)}
                              </td>
                              {isProfiles && (
                                <td className="py-1.5 pr-3 font-medium text-brand-700">
                                  {sd.packages ?? '—'}
                                  {sd.perPackage !== undefined && (
                                    <span className="ml-1 text-ink-soft">
                                      (×{sd.perPackage})
                                    </span>
                                  )}
                                </td>
                              )}
                              <td className="py-1.5 pr-3 whitespace-nowrap">
                                {formatShortDateTime(sd.start, lang)}
                              </td>
                              <td className="py-1.5 whitespace-nowrap">
                                {formatShortDateTime(sd.end, lang)}
                              </td>
                            </tr>
                            {hasProducedAtSize && (
                              <tr
                                className={
                                  isLastSub && sd.timePerUnitMin === undefined
                                    ? 'border-b border-neutral-100 bg-brand-50/30 last:border-b-0'
                                    : 'border-b-0 bg-brand-50/30'
                                }
                              >
                                <td
                                  colSpan={colSpan}
                                  className="px-4 pb-2 pt-0"
                                >
                                  <SizeProducedBlock sd={sd} t={t} mode={mode} />
                                </td>
                              </tr>
                            )}
                            {sd.timePerUnitMin !== undefined &&
                              sd.totalUnits !== undefined && (
                                <tr
                                  className={
                                    isLastSub
                                      ? 'border-b border-neutral-100 bg-brand-50/30 last:border-b-0'
                                      : 'border-b-0 bg-brand-50/30'
                                  }
                                >
                                  <td
                                    colSpan={colSpan}
                                    className="px-4 pb-2 pt-0"
                                  >
                                    <PerUnitBlock
                                      start={sd.start}
                                      timePerUnitMin={sd.timePerUnitMin}
                                      totalUnits={sd.totalUnits}
                                      mode={mode}
                                      t={t}
                                    />
                                  </td>
                                </tr>
                              )}
                          </Fragment>
                        );
                      })}
                    {showAggregateProduced && (
                      <tr
                        className={
                          row.timePerUnitMin !== undefined
                            ? 'border-b-0 bg-brand-50/40'
                            : 'border-b border-neutral-100 bg-brand-50/40 last:border-b-0'
                        }
                      >
                        <td colSpan={colSpan} className="px-3 pb-3 pt-1">
                          <ProducedRemainingBlock
                            row={row}
                            t={t}
                            mode={mode}
                          />
                        </td>
                      </tr>
                    )}
                    {!hasSizeBreakdown &&
                      row.timePerUnitMin !== undefined &&
                      row.totalUnits !== undefined && (
                        <tr className="border-b border-neutral-100 bg-brand-50/40 last:border-b-0">
                          <td colSpan={colSpan} className="px-3 pb-3 pt-1">
                            <PerUnitBlock
                              start={row.start}
                              timePerUnitMin={row.timePerUnitMin}
                              totalUnits={row.totalUnits}
                              mode={mode}
                              t={t}
                            />
                          </td>
                        </tr>
                      )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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
    <div className="mt-1.5 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs">
      {isProfiles && sd.producedProfiles !== undefined && (
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5">
          <dt className="text-ink-soft">
            {t('orders.advanced.profilesProduced')}
          </dt>
          <dd className="font-medium text-ink">
            {sd.producedProfiles}
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
            {sd.producedSheetsAtSize}
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
  const units = {
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
  };
  return (
    <div className="mt-2 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs">
      {isProfiles && row.producedProfiles !== undefined && (
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1">
          <dt className="text-ink-soft">{t('orders.advanced.profilesProduced')}</dt>
          <dd className="font-medium text-ink">
            {row.producedProfiles}
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
            {row.producedSheets}
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
  timePerUnitMin,
  totalUnits,
  mode,
  t,
}: {
  start: Date;
  timePerUnitMin: number;
  totalUnits: number;
  mode: CalculatorMode;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const kind: 'pallet' | 'package' = mode === 'profiles' ? 'package' : 'pallet';
  const units = {
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
  };
  return (
    <div className="mt-2 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-ink-soft">
          {t(`results.${kind}.timePerOne`)}
        </span>
        <span className="font-semibold text-brand-700">
          {formatDuration(timePerUnitMin, units)}
        </span>
      </div>
      <UnitsTimeline
        start={start}
        timePerUnitMin={timePerUnitMin}
        totalUnits={totalUnits}
        kind={kind}
      />
    </div>
  );
}

export default ResultsPanel;
