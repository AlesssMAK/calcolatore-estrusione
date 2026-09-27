import type { CalculatorMode, ScheduleResult, ScheduledOrder } from '../types';
import {
  formatDateTime,
  formatDuration,
  formatShortDateTime,
} from '../utils/format';
import { calculateTotalProfiles } from '../utils/calculator';

// A translate function (react-i18next's `t`), narrowed to what we use here.
type T = (key: string, opts?: Record<string, unknown>) => string;

interface BuildOpts {
  mode: CalculatorMode;
  lang: string;
  units: { day: string; hour: string; minute: string };
  t: T;
  /** Active company name, printed under the title (branding for the recipient). */
  companyName?: string;
}

const formatLength = (m: number): string =>
  m >= 100 ? m.toFixed(0) : m.toFixed(2).replace(/\.?0+$/, '');

// count × length suffix for a single-size order (mirrors the on-screen table).
function sizeSuffix(row: ScheduledOrder): string | null {
  if (row.order.useTotalLength) return null;
  const sizes = row.order.sizes ?? [];
  if (sizes.length !== 1) return null;
  const sheets = sizes[0]?.sheets;
  const length = sizes[0]?.length;
  if (!sheets || !length) return null;
  return `${sheets}×${length}`;
}

function isRowDone(row: ScheduledOrder): boolean {
  return (
    row.completed === true ||
    (row.productionMinutes >= 0.5 && row.remainingMinutes < 0.5)
  );
}

/**
 * Render the results into a crisp, vector PDF (text stays selectable and sharp
 * at any zoom, unlike the raster image export) and return it as a Blob. Uses
 * jsPDF + autoTable, loaded on demand so they stay out of the main bundle.
 *
 * Content mirrors the on-screen result: the summary totals + a per-order
 * breakdown, with multi-day parts and multi-size rows as indented sub-rows.
 * Standard PDF fonts (Helvetica) cover it/en/es; no emoji (they don't render).
 */
export async function buildResultPdfBlob(
  result: ScheduleResult,
  opts: BuildOpts,
): Promise<Blob> {
  const { mode, lang, units, t, companyName } = opts;
  const isProfiles = mode === 'profiles';
  const dur = (min: number) => formatDuration(min, units);

  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // --- Header -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(t('results.title'), margin, y + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(formatDateTime(new Date(), lang), pageW - margin, y, {
    align: 'right',
  });
  y += 8;

  if (result.productName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(150, 20, 30);
    doc.text(result.productName, margin, y);
    y += 6;
  }
  if (companyName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(companyName, margin, y);
    y += 5;
  }
  y += 2;

  // --- Summary ------------------------------------------------------------
  const summary: [string, string][] = [
    [t('results.totalProduction'), dur(result.totalProductionMinutes)],
  ];
  if (result.totalGapMinutes > 0) {
    summary.push([t('results.totalGap'), dur(result.totalGapMinutes)]);
  }
  summary.push([t('results.totalDuration'), dur(result.totalDurationMinutes)]);
  summary.push([t('results.endAt'), formatDateTime(result.endAt, lang)]);
  if (isProfiles && result.totalPackages !== undefined) {
    summary.push([t('results.totalPackages'), String(result.totalPackages)]);
  }

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.2 },
    columnStyles: {
      0: { textColor: [110, 110, 110], cellWidth: 70 },
      1: { textColor: [20, 20, 20], fontStyle: 'bold' },
    },
    body: summary,
  });
  // autoTable stashes the final Y on the doc; fall back defensively.
  y =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y + summary.length * 6;
  y += 6;

  // --- Breakdown ----------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(t('results.breakdown').toUpperCase(), margin, y);
  y += 3;

  const head = isProfiles
    ? [
        t('results.col.number'),
        t('results.col.profiles'),
        t('results.col.packages'),
        t('results.col.speed'),
        t('results.col.productionTime'),
        t('results.col.start'),
        t('results.col.end'),
      ]
    : [
        t('results.col.number'),
        t('results.col.meters'),
        t('results.col.speed'),
        t('results.col.productionTime'),
        t('results.col.start'),
        t('results.col.end'),
      ];

  // A muted, indented sub-row (parts / sizes) — a cell factory keeps styling
  // consistent across the varying column counts.
  const sub = (content: string) => ({
    content,
    styles: {
      textColor: [130, 130, 130] as [number, number, number],
      fontStyle: 'italic' as const,
    },
  });

  type Cell = string | ReturnType<typeof sub>;
  const body: Cell[][] = [];

  result.rows.forEach((row, idx) => {
    const done = isRowDone(row);
    const suffix = sizeSuffix(row);
    const ordine =
      `#${idx + 1}` +
      (row.order.productName ? ` ${row.order.productName}` : '') +
      (done ? ` (${t('results.completed')})` : '');
    const meters =
      `${formatLength(row.totalLengthM)} m` + (suffix ? ` (${suffix})` : '');

    if (isProfiles) {
      body.push([
        ordine,
        String(calculateTotalProfiles(row.order) ?? '—'),
        row.packages != null ? String(row.packages) : '—',
        String(row.speedMPerMin ?? '—'),
        dur(row.remainingMinutes),
        formatShortDateTime(row.start, lang),
        formatShortDateTime(row.end, lang),
      ]);
    } else {
      body.push([
        ordine,
        meters,
        String(row.speedMPerMin ?? '—'),
        dur(row.remainingMinutes),
        formatShortDateTime(row.start, lang),
        formatShortDateTime(row.end, lang),
      ]);
    }

    // Multi-size breakdown → one sub-row per size.
    if (row.sizeDetails && row.sizeDetails.length > 1) {
      row.sizeDetails.forEach((sd) => {
        const label = `   – ${sd.sheets}×${sd.length}`;
        if (isProfiles) {
          body.push([
            sub(label),
            sub(String(sd.producedProfiles != null ? sd.producedProfiles : sd.sheets)),
            sub(sd.packages != null ? String(sd.packages) : ''),
            sub(''),
            sub(dur(sd.remainingMinutes)),
            sub(formatShortDateTime(sd.start, lang)),
            sub(formatShortDateTime(sd.end, lang)),
          ]);
        } else {
          body.push([
            sub(label),
            sub(`${formatLength(sd.metersM)} m`),
            sub(''),
            sub(dur(sd.remainingMinutes)),
            sub(formatShortDateTime(sd.start, lang)),
            sub(formatShortDateTime(sd.end, lang)),
          ]);
        }
      });
    }

    // Multi-day parts (production split across non-working gaps) → sub-rows.
    if (row.segments && row.segments.length > 1) {
      row.segments.forEach((seg, sIdx) => {
        const label = `   – ${t('results.part', { n: sIdx + 1 })}`;
        if (isProfiles) {
          body.push([
            sub(label),
            sub(seg.pieces != null ? String(seg.pieces) : `${formatLength(seg.metersM)} m`),
            sub(''),
            sub(''),
            sub(dur(seg.minutes)),
            sub(formatShortDateTime(seg.start, lang)),
            sub(formatShortDateTime(seg.end, lang)),
          ]);
        } else {
          body.push([
            sub(label),
            sub(
              `${formatLength(seg.metersM)} m` +
                (seg.pieces != null ? ` (${seg.pieces} pz)` : ''),
            ),
            sub(''),
            sub(dur(seg.minutes)),
            sub(formatShortDateTime(seg.start, lang)),
            sub(formatShortDateTime(seg.end, lang)),
          ]);
        }
      });
    }
  });

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    styles: { fontSize: 8.5, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: {
      fillColor: [200, 16, 46],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: margin, right: margin },
  });

  return doc.output('blob');
}
