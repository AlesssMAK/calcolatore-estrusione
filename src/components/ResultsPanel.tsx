import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalculatorMode, ScheduleResult, ScheduledOrder } from '../types';
import { calculateTotalProfiles } from '../utils/calculator';
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

      if (
        row.producedProfiles !== undefined ||
        row.producedSheets !== undefined
      ) {
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
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 print:border-0 print:shadow-none">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-ink sm:text-lg">
          {t('results.title')}
        </h2>
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

                {(row.producedProfiles !== undefined ||
                  row.producedSheets !== undefined) && (
                  <ProducedRemainingBlock row={row} t={t} mode={mode} />
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
                return (
                  <Fragment key={row.order.id}>
                    <tr
                      className={
                        hasProduced
                          ? 'border-b-0'
                          : 'border-b border-neutral-100 last:border-b-0'
                      }
                    >
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
                    {hasProduced && (
                      <tr className="border-b border-neutral-100 bg-brand-50/40 last:border-b-0">
                        <td colSpan={colSpan} className="px-3 pb-3 pt-1">
                          <ProducedRemainingBlock
                            row={row}
                            t={t}
                            mode={mode}
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

export default ResultsPanel;
