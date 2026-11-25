// "Marcatura QR": the text the line's marker prints on the profile, handed to
// it as a QR code — made here, pasted into the order sheet (Excel), read off
// the sheet by the marker's scanner. The marker adds the date / time itself.
//
// A marking may have a spot for the order number: `{ordine}`, or the
// "nr. Del LOTTO" the order sheets already write there. It's filled in before
// the code is made.
//
// The company's standard markings come from /admin (company_settings.markings);
// "Le Mie" are kept on this device.

export interface Marking {
  id: string;
  name: string;
  text: string;
}

/** What "+ N° Ordine" puts in the text. */
export const ORDER_TOKEN = '{ordine}';
export const MAX_MARKING_NAME = 60;
/** A marker prints a line or two: far under what a QR holds. */
export const MAX_MARKING_TEXT = 500;

/** The order number's spot: the token, or the order sheets' "nr. Del LOTTO". */
const SPOT_SRC = String.raw`\{ordine\}|nr\.?\s*del\s+lotto`;
const spotRe = () => new RegExp(SPOT_SRC, 'gi');

export function hasOrderSpot(text: string): boolean {
  return spotRe().test(text);
}

/** The text with its spots shown apart (to tell the order number in it). */
export function markingParts(
  text: string,
  order: string
): { text: string; spot: boolean }[] {
  const parts: { text: string; spot: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(spotRe())) {
    if (m.index > at)
      parts.push({ text: text.slice(at, m.index), spot: false });
    parts.push({ text: order.trim(), spot: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), spot: false });
  return parts;
}

/** What goes into the QR: the text, its spots filled with the order number. */
export function fillMarking(text: string, order: string): string {
  return text.replace(spotRe(), () => order.trim()).trim();
}

/** Tolerant parse of a stored list: drops malformed / repeated entries. */
export function normalizeMarkings(raw: unknown): Marking[] {
  if (!Array.isArray(raw)) return [];
  const out: Marking[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const p = (item ?? {}) as Record<string, unknown>;
    const id = typeof p.id === 'string' ? p.id : '';
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const text = typeof p.text === 'string' ? p.text.trim() : '';
    if (!id || !name || !text || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: name.slice(0, MAX_MARKING_NAME),
      text: text.slice(0, MAX_MARKING_TEXT),
    });
  }
  return out;
}

const KEY = 'calc.markings';

/** "Le Mie": the markings kept on this device. */
export function loadMyMarkings(): Marking[] {
  try {
    return normalizeMarkings(
      JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    );
  } catch {
    return [];
  }
}

/** False when they couldn't be kept. */
export function saveMyMarkings(list: Marking[]): boolean {
  try {
    if (list.length > 0) window.localStorage.setItem(KEY, JSON.stringify(list));
    else window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** "QR-2611.png" / "QR-stabilit-suisse-1uv.png": the order number, else the
 *  marking's name, else the text's start. */
export function qrFileName(order: string, name: string, text: string): string {
  const slug = (order.trim() || name.trim() || text.slice(0, 30))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `QR-${slug || 'marcatura'}.png`;
}

/** A data: URL's bytes (a PNG made here) as a Blob — without fetch, which the
 *  CSP keeps to the app's own origins. */
export function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',', 2);
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** The QR as a PNG (data: URL), whole pixels per module and the standard
 *  4-module border, about 4–5 cm once pasted into Excel (96 dpi). */
export async function makeQrPng(text: string): Promise<string> {
  const QR = await import('qrcode');
  const size = QR.create(text, { errorCorrectionLevel: 'M' }).modules.size + 8;
  const scale = Math.max(3, Math.round(170 / size));
  return QR.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 4,
    scale,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
