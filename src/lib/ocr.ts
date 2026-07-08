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
 * Run OCR on an image (Blob / dataURL / HTMLCanvasElement) and return parsed
 * rows. `onProgress` is called during recognition so the UI can show a bar.
 */
export async function recognizeSheets(
  image: Blob | string | HTMLCanvasElement,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrRow[]> {
  const { recognize } = await import('tesseract.js');
  const { data } = await recognize(image, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.({ status: m.status, progress: m.progress });
    },
  });
  return parseOcrText(data.text);
}
