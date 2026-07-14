// OCR for the "Piramide" page. Reads the Lunghezza / Quantità columns off a
// photo of a printed production sheet (AKRAPLAST-style form).
//
// Tesseract is heavy (WASM + language data), so it is dynamically imported —
// it never lands in the main calculator bundle and only downloads when the
// operator actually runs a scan on this page.
//
// OCR is best-effort: the parsed rows land in an editable table where the
// operator verifies and corrects them before computing. We keep the pipeline
// deliberately simple — upscale + grayscale, then let Tesseract do its own
// (robust, adaptive) thresholding and layout. Home-grown global binarization
// and row-segmentation both proved LESS reliable on real phone photos.

export interface OcrRow {
  length: number;
  qty: number;
}

/** Lines that are headers / totals / unit rows, never a real sheet row. */
const NOISE = /(?:\bml\b|\bkg\b|\bmq\b|m²|totale|peso|quantit|lunghezz|turno|nome|capo|segnalazion|ordine|cliente|articolo)/i;

const MIN_LEN = 300;
// Real sheet/profile lengths top out around ~11 m. Anything longer is almost
// always a quantity glued onto the length (e.g. "25095" = qty 2 + 5095), so we
// cap "plausible length" here and let splitMergedQtyLength un-glue the rest.
const MAX_LEN = 13000;

/**
 * Recover a qty+length that OCR glued into one token when the space between
 * the two columns collapsed (e.g. "410230" → qty 4 + length 10230, "46740" →
 * 4 + 6740). Peels a 1–2 digit quantity off the front, keeping the rest as a
 * plausible length. Returns null when no such split exists.
 */
function splitMergedQtyLength(token: string): OcrRow | null {
  for (let cut = 1; cut <= 2 && cut < token.length; cut++) {
    const qty = Number(token.slice(0, cut));
    const length = Number(token.slice(cut));
    if (qty >= 1 && qty < 100 && length >= MIN_LEN && length <= MAX_LEN) {
      return { length, qty };
    }
  }
  return null;
}

/**
 * Parse OCR text into candidate {length, qty} rows.
 *
 * Heuristics tuned to the form layout (Quantità column first, then Lunghezza):
 *  - Two-decimal tokens (Peso 52,30 / mq 20,92) are stripped first — they can
 *    never be lengths. Only 2-dp values, so a glued number keeps its digits.
 *  - Of the remaining integers on a line: the first small one (< 300) is the
 *    quantity, the plausible sheet length (300–13000 mm) is the length.
 *  - If a line has NO plausible length but an oversized number, it's a glued
 *    qty+length — split it back (this is what fixes the dropped rows).
 */
export function parseOcrText(text: string): OcrRow[] {
  const rows: OcrRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;

    const cleaned = line.replace(/\d+[.,]\d{2}(?!\d)/g, ' ');
    const tokens = cleaned.match(/\d+/g) ?? [];
    if (tokens.length === 0) continue;
    const nums = tokens.map(Number);

    const lengths = nums.filter((n) => n >= MIN_LEN && n <= MAX_LEN);
    if (lengths.length > 0) {
      const length = Math.max(...lengths);
      const qty = nums.find((n) => n >= 1 && n < 300) ?? 1;
      rows.push({ length, qty });
      continue;
    }

    for (const tok of tokens) {
      if (Number(tok) > MAX_LEN) {
        const split = splitMergedQtyLength(tok);
        if (split) {
          rows.push(split);
          break;
        }
      }
    }
  }
  return rows;
}

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

export interface OcrResult {
  /** Rows after parsing/filtering — what fills the editable table. */
  rows: OcrRow[];
  /** Raw text Tesseract returned, before parsing. Kept for the diagnostics
   *  panel: lets us see whether a missing/odd row is an OCR miss or a parser
   *  quirk without guessing. */
  rawText: string;
  /** Tesseract's overall confidence 0..100. */
  confidence: number;
}

/**
 * Prepare a cropped image for OCR: upscale small crops (Tesseract wants a
 * decent glyph height) and convert to grayscale. No thresholding — Tesseract's
 * own adaptive binarization handles uneven lighting far better than a global
 * cut did.
 */
export function preprocessForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const MIN_W = 1600;
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
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Run OCR on an image (Blob / dataURL / HTMLCanvasElement) → parsed rows.
 * Canvas inputs are upscaled + grayscaled first. The character whitelist is
 * digits + separators only (so 0↔O, 1↔l, 5↔S, 8↔B confusions can't happen),
 * and page segmentation is a single uniform block for the tabular layout.
 */
export async function recognizeSheets(
  image: Blob | string | HTMLCanvasElement,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
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
    return {
      rows: parseOcrText(data.text),
      rawText: data.text,
      confidence: data.confidence,
    };
  } finally {
    await worker.terminate();
  }
}
