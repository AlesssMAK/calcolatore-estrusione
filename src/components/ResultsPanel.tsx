import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalculatorMode, ScheduleResult } from '../types';
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
    lines.push(
      `${t('results.endAt')}: ${formatDateTime(result.endAt, lang)}`,
    );
    if (isProfiles && result.totalPackages !== undefined) {
      lines.push(
        `${t('results.totalPackages')}: ${result.totalPackages}`,
      );
    }
    lines.push('');
    lines.push(t('results.breakdown'));

    result.rows.forEach((row, idx) => {
      const pkgPart =
        isProfiles && row.packages !== undefined
          ? `  →  ${row.packages} ${t('results.col.packages')}`
          : '';
      lines.push(
        `#${idx + 1}  ${row.order.sheets} × ${row.order.sheetLengthMm} mm  @ ${row.speedMPerMin} m/min  →  ${formatDuration(row.productionMinutes, units)}  (${formatShortDateTime(row.start, lang)} – ${formatShortDateTime(row.end, lang)})${pkgPart}`,
      );
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

  const countColLabel = isProfiles
    ? t('results.col.profiles')
    : t('results.col.sheets');

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

      <div className="mt-6 overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          {t('results.breakdown')}
        </h3>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
              <th className="py-2 pr-3">{t('results.col.number')}</th>
              <th className="py-2 pr-3">{countColLabel}</th>
              <th className="py-2 pr-3">{t('results.col.sheetLength')}</th>
              <th className="py-2 pr-3">{t('results.col.speed')}</th>
              <th className="py-2 pr-3">
                {t('results.col.productionTime')}
              </th>
              {isProfiles && (
                <th className="py-2 pr-3">{t('results.col.packages')}</th>
              )}
              <th className="py-2 pr-3">{t('results.col.start')}</th>
              <th className="py-2">{t('results.col.end')}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, idx) => (
              <tr
                key={row.order.id}
                className="border-b border-neutral-100 last:border-b-0"
              >
                <td className="py-2 pr-3 font-semibold text-brand-600">
                  #{idx + 1}
                </td>
                <td className="py-2 pr-3">{row.order.sheets}</td>
                <td className="py-2 pr-3">{row.order.sheetLengthMm}</td>
                <td className="py-2 pr-3">{row.speedMPerMin}</td>
                <td className="py-2 pr-3 font-medium">
                  {formatDuration(row.productionMinutes, units)}
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
            ))}
          </tbody>
        </table>
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

export default ResultsPanel;
