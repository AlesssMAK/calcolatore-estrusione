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

type RGB = [number, number, number];
const INK: RGB = [24, 24, 27];
const SOFT: RGB = [113, 113, 122];
const BRAND: RGB = [200, 16, 46];
const CARD_BG: RGB = [250, 250, 250];
const CARD_BORDER: RGB = [228, 228, 231];
const AMBER_BG: RGB = [255, 251, 235];
const AMBER_BORDER: RGB = [253, 224, 156];
const AMBER_INK: RGB = [180, 120, 20];
const SIZE_BG: RGB = [252, 244, 246];

const formatLength = (m: number): string =>
  m >= 100 ? m.toFixed(0) : m.toFixed(2).replace(/\.?0+$/, '');

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

// --- Card model: one order flattened into the same fields the mobile card shows.
interface Sub {
  header: string;
  right: string;
  rows: [string, string][];
}
interface Part {
  left: string;
  right: string;
  dates: string;
  qty: string;
}
interface CardModel {
  headerLeft: string;
  done: boolean;
  headerRight: string;
  rows: [string, string][];
  segTitle?: string;
  parts?: Part[];
  sizes?: Sub[];
}

/**
 * Render the results into a crisp, vector PDF laid out as CARDS — the same
 * shape as the app's mobile/tablet result view (one card per order, with size
 * and multi-day-part sub-cards) rather than a dense table. Text stays vector
 * (sharp at any zoom, tiny file) unlike an image screenshot. jsPDF is loaded on
 * demand so it stays out of the main bundle. Standard PDF fonts (Helvetica)
 * cover it/en/es; no emoji (they don't render in the core fonts).
 */
export async function buildResultPdfBlob(
  result: ScheduleResult,
  opts: BuildOpts,
): Promise<Blob> {
  const { mode, lang, units, t, companyName } = opts;
  const isProfiles = mode === 'profiles';
  const dur = (min: number) => formatDuration(min, units);

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const ensure = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };
  // Truncate a string to fit `w` mm at the current font, adding an ellipsis.
  const fit = (s: string, w: number): string => {
    if (doc.getTextWidth(s) <= w) return s;
    let out = s;
    while (out.length > 1 && doc.getTextWidth(out + '…') > w) {
      out = out.slice(0, -1);
    }
    return out + '…';
  };

  const timePerItem = (row: ScheduledOrder): string | undefined => {
    const items = calculateTotalProfiles(row.order);
    return items && items > 0 && row.productionMinutes > 0
      ? dur(row.productionMinutes / items)
      : undefined;
  };

  // --- Header -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  setText(INK);
  doc.text(t('results.title'), margin, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(SOFT);
  doc.text(formatDateTime(new Date(), lang), pageW - margin, y, {
    align: 'right',
  });
  y += 9;
  if (result.productName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    setText(BRAND);
    doc.text(fit(result.productName, contentW), margin, y);
    y += 6;
  }
  if (companyName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(SOFT);
    doc.text(companyName, margin, y);
    y += 5;
  }
  y += 3;

  // --- Summary tiles ------------------------------------------------------
  const tiles: { label: string; value: string; accent?: boolean }[] = [
    {
      label: t('results.totalProduction'),
      value: dur(result.totalProductionMinutes),
      accent: true,
    },
  ];
  if (result.totalGapMinutes > 0) {
    tiles.push({
      label: t('results.totalGap'),
      value: dur(result.totalGapMinutes),
    });
  }
  tiles.push({
    label: t('results.totalDuration'),
    value: dur(result.totalDurationMinutes),
  });
  tiles.push({
    label: t('results.endAt'),
    value: formatDateTime(result.endAt, lang),
    accent: true,
  });
  if (isProfiles && result.totalPackages !== undefined) {
    tiles.push({
      label: t('results.totalPackages'),
      value: String(result.totalPackages),
      accent: true,
    });
  }
  const tileGap = 4;
  const tileW = (contentW - tileGap) / 2;
  const tileH = 15;
  for (let i = 0; i < tiles.length; i += 2) {
    ensure(tileH + 2);
    for (let c = 0; c < 2 && i + c < tiles.length; c++) {
      const tile = tiles[i + c]!;
      const tx = margin + c * (tileW + tileGap);
      setFill(tile.accent ? SIZE_BG : CARD_BG);
      setDraw(tile.accent ? AMBER_BORDER : CARD_BORDER);
      setDraw(tile.accent ? [246, 200, 208] : CARD_BORDER);
      doc.roundedRect(tx, y, tileW, tileH, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setText(SOFT);
      doc.text(fit(tile.label.toUpperCase(), tileW - 6), tx + 3, y + 5.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setText(tile.accent ? BRAND : INK);
      doc.text(fit(tile.value, tileW - 6), tx + 3, y + 11.5);
    }
    y += tileH + tileGap;
  }
  y += 2;

  // --- Breakdown heading --------------------------------------------------
  ensure(8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setText(SOFT);
  doc.text(t('results.breakdown').toUpperCase(), margin, y + 2);
  y += 6;

  // --- Build card models --------------------------------------------------
  const cards: CardModel[] = result.rows.map((row, idx) => {
    const done = isRowDone(row);
    const suffix = sizeSuffix(row);
    const rows: [string, string][] = [];
    if (isProfiles) {
      rows.push([
        t('results.col.profiles'),
        String(calculateTotalProfiles(row.order) ?? '—'),
      ]);
    }
    rows.push([
      t('results.col.meters'),
      `${formatLength(row.totalLengthM)} m${suffix ? ` (${suffix})` : ''}`,
    ]);
    rows.push([t('results.col.speed'), String(row.speedMPerMin ?? '—')]);
    const per = timePerItem(row);
    if (per !== undefined) {
      rows.push([
        t(isProfiles ? 'results.timePerItem.profiles' : 'results.timePerItem.sheets'),
        per,
      ]);
    }
    if (isProfiles) {
      rows.push([
        t('results.col.packages'),
        row.packages != null ? String(row.packages) : '—',
      ]);
    }
    rows.push([t('results.col.start'), formatShortDateTime(row.start, lang)]);
    rows.push([t('results.col.end'), formatShortDateTime(row.end, lang)]);

    const model: CardModel = {
      headerLeft:
        `#${idx + 1}` +
        (row.order.productName ? `  ${row.order.productName}` : ''),
      done,
      headerRight: dur(row.remainingMinutes),
      rows,
    };

    if (row.segments && row.segments.length > 1) {
      model.segTitle = t('results.splitParts', { n: row.segments.length });
      const unitLower = (
        isProfiles ? t('results.col.profiles') : t('results.col.sheets')
      ).toLowerCase();
      model.parts = row.segments.map((seg, sIdx) => ({
        left: t('results.part', { n: sIdx + 1 }),
        right: dur(seg.minutes),
        dates: `${formatShortDateTime(seg.start, lang)} – ${formatShortDateTime(seg.end, lang)}`,
        qty:
          `${formatLength(seg.metersM)} m` +
          (seg.pieces != null ? ` · ${seg.pieces} ${unitLower}` : ''),
      }));
    }

    if (row.sizeDetails && row.sizeDetails.length > 1) {
      model.sizes = row.sizeDetails.map((sd, sIdx) => {
        const sRows: [string, string][] = [
          [
            isProfiles ? t('results.col.profiles') : t('results.col.sheets'),
            `${sd.sheets} × ${sd.length} mm`,
          ],
          [t('results.col.meters'), `${formatLength(sd.metersM)} m`],
        ];
        if (isProfiles && sd.packages !== undefined) {
          sRows.push([
            t('results.col.packages'),
            `${sd.packages}${sd.perPackage !== undefined ? ` (× ${sd.perPackage})` : ''}`,
          ]);
        }
        sRows.push([t('results.col.start'), formatShortDateTime(sd.start, lang)]);
        sRows.push([t('results.col.end'), formatShortDateTime(sd.end, lang)]);
        return {
          header: `» #${idx + 1}.${sIdx + 1}`,
          right: dur(sd.remainingMinutes),
          rows: sRows,
        };
      });
    }
    return model;
  });

  // --- Measure + draw one card -------------------------------------------
  const PAD = 4;
  const ROW_H = 5;
  const ROW_SM = 4.4;
  const HEADER_H = 7.5;
  const labelW = 32;
  const doneTxt = t('results.completed');

  const cardHeight = (m: CardModel): number => {
    let h = PAD * 2 + HEADER_H;
    h += m.rows.length * ROW_H;
    if (m.parts) {
      h += 6 + 3; // title + inner padding
      h += m.parts.length * 13;
    }
    if (m.sizes) {
      for (const s of m.sizes) {
        h += 2 + 5.5 + s.rows.length * ROW_SM + 4; // gap + header + rows + pad
      }
    }
    return h;
  };

  const drawCard = (m: CardModel) => {
    const h = cardHeight(m);
    ensure(h + 4);
    const x = margin;
    // Card background.
    setFill(CARD_BG);
    setDraw(CARD_BORDER);
    doc.roundedRect(x, y, contentW, h, 2.5, 2.5, 'FD');
    let cy = y + PAD;

    // Header: "#N  Product"  ......  remaining time (right).
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setText(INK);
    const rightTxt = m.headerRight;
    doc.setFontSize(10.5);
    const rightW = doc.getTextWidth(rightTxt) + 2;
    let leftMax = contentW - PAD * 2 - rightW;
    if (m.done) leftMax -= doc.getTextWidth(`  (${doneTxt})`) + 2;
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
    const hx = x + PAD;
    doc.text(fit(m.headerLeft, Math.max(20, leftMax)), hx, cy + 5);
    if (m.done) {
      const lw = doc.getTextWidth(fit(m.headerLeft, Math.max(20, leftMax)));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(22, 163, 74);
      doc.text(`(${doneTxt})`, hx + lw + 2, cy + 5);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.text(rightTxt, x + contentW - PAD, cy + 5, { align: 'right' });
    cy += HEADER_H;

    // dl rows.
    for (const [label, value] of m.rows) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setText(SOFT);
      doc.text(label, x + PAD, cy + 3.4);
      doc.setFont('helvetica', 'bold');
      setText(INK);
      doc.text(fit(value, contentW - PAD * 2 - labelW), x + PAD + labelW, cy + 3.4);
      cy += ROW_H;
    }

    // Segments box.
    if (m.parts && m.segTitle) {
      const boxX = x + PAD;
      const boxW = contentW - PAD * 2;
      const boxH = 6 + m.parts.length * 13 - 1;
      setFill(AMBER_BG);
      setDraw(AMBER_BORDER);
      doc.roundedRect(boxX, cy, boxW, boxH, 1.5, 1.5, 'FD');
      let py = cy + 4.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      setText(AMBER_INK);
      doc.text(m.segTitle, boxX + 2.5, py);
      py += 3;
      m.parts.forEach((p) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setText(AMBER_INK);
        doc.text(p.left, boxX + 3, py + 3);
        doc.setFont('helvetica', 'normal');
        setText(SOFT);
        doc.text(p.right, boxX + boxW - 3, py + 3, { align: 'right' });
        doc.text(p.dates, boxX + 3, py + 6.6);
        doc.setFont('helvetica', 'bold');
        setText(INK);
        doc.text(fit(p.qty, boxW - 6), boxX + 3, py + 10);
        py += 13;
      });
      cy += boxH + 1;
    }

    // Size sub-cards.
    if (m.sizes) {
      for (const s of m.sizes) {
        cy += 2;
        const boxX = x + PAD;
        const boxW = contentW - PAD * 2;
        const boxH = 5.5 + s.rows.length * ROW_SM + 2;
        setFill(SIZE_BG);
        setDraw([246, 200, 208]);
        doc.roundedRect(boxX, cy, boxW, boxH, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setText(BRAND);
        doc.text(s.header, boxX + 3, cy + 4.5);
        setText(INK);
        doc.text(s.right, boxX + boxW - 3, cy + 4.5, { align: 'right' });
        let sy = cy + 8;
        for (const [label, value] of s.rows) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          setText(SOFT);
          doc.text(label, boxX + 3, sy);
          doc.setFont('helvetica', 'bold');
          setText(INK);
          doc.text(fit(value, boxW - 6 - labelW), boxX + 3 + labelW, sy);
          sy += ROW_SM;
        }
        cy += boxH;
      }
    }

    y += h + 4;
  };

  cards.forEach(drawCard);

  return doc.output('blob');
}
