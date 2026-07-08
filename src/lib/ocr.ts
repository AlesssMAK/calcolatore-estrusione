// OCR for the "Piramide" page. Reads the Lunghezza / Quantità columns off a
// photo of a printed production sheet (AKRAPLAST-style form).
//
// Tesseract is heavy (WASM + language data), so it is dynamically imported —
// it never lands in the main calculator bundle and only downloads when the
// operator actually runs a scan on this page.
//
// OCR is best-effort: the parsed rows land in an editable table where the
// operator verifies and corrects them before computing. We favour recall
// (grab plausible length/qty pairs) over precision (the human fixes the rest).

export interface OcrRow {
  length: number;
  qty: number;
}

/** Lines that are headers / totals / unit rows, never a real sheet row. */
const NOISE = /(?:\bml\b|\bkg\b|\bmq\b|m²|totale|peso|quantit|lunghezz|turno|nome|capo|segnalazion|ordine|cliente|articolo)/i;

/**
 * Parse Tesseract's raw text into candidate {length, qty} rows.
 *
 * Heuristics tuned to the form layout (Quantità column first, then Lunghezza):
 *  - Decimal tokens (Peso 52,30 / mq 20,92) are stripped first — they use a
 *    comma/point and are never lengths or quantities.
 *  - Of the remaining integers on a line: the first small one (< 300) is the
 *    quantity, and the plausible sheet length (300–30000 mm) is the length.
 *  - Header / totals lines are skipped by keyword.
 */
export function parseOcrText(text: string): OcrRow[] {
  const rows: OcrRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;

    // Drop decimals (52,30 / 20.92) so they don't masquerade as integers.
    const cleaned = line.replace(/\d+[.,]\d+/g, ' ');
    const ints = (cleaned.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
    if (ints.length === 0) continue;

    const lengths = ints.filter((n) => n >= 300 && n <= 30000);
    if (lengths.length === 0) continue;
    const qtys = ints.filter((n) => n >= 1 && n < 300);

    // Usually one length per line; if OCR merged two, take the largest.
    const length = Math.max(...lengths);
    const qty = qtys[0] ?? 1;
    rows.push({ length, qty });
  }
  return rows;
}

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

/**
 * Prepare a cropped image for OCR. Tesseract reads printed digits far better
 * on a clean, high-contrast, reasonably large bitmap than on a raw phone
 * photo, so we:
 *   1. upscale small crops (Tesseract wants a decent glyph height);
 *   2. convert to grayscale;
 *   3. binarize with an Otsu global threshold → crisp black text on white.
 * All done on a canvas, no extra deps.
 */
export function preprocessForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const MIN_W = 1400;
  const scale = source.width < MIN_W ? Math.min(3, MIN_W / source.width) : 1;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const total = w * h;

  // Grayscale + histogram.
  const gray = new Uint8ClampedArray(total);
  const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    gray[p] = g;
    hist[g]++;
  }

  // Otsu threshold: maximise between-class variance.
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = gray[p] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Run OCR on an image (Blob / dataURL / HTMLCanvasElement) and return parsed
 * rows. Canvas inputs are preprocessed (binarized + upscaled) first.
 *
 * Tuned for number columns: the character whitelist is restricted to digits
 * and separators (so 0→O, 1→l, 5→S, 8→B confusions can't happen) and page
 * segmentation is set to a single uniform block, which suits the tabular
 * Lunghezza/Quantità layout.
 */
export async function recognizeSheets(
  image: Blob | string | HTMLCanvasElement,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrRow[]> {
  const source =
    typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement
      ? preprocessForOcr(image)
      : image;

  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.({ status: m.status, progress: m.progress });
    },
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.,',
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(source);
    return parseOcrText(data.text);
  } finally {
    await worker.terminate();
  }
}
