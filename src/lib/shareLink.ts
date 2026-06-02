import type { ScheduleResult } from '../types';

// URL query param key. Bumped only on breaking shape changes — the decoder
// silently returns null on parse errors so old links still degrade safely.
const QUERY_KEY = 'calc';

/** Restore Date objects after JSON.parse. Mirrors the reviver in
 *  calcHistory.ts; kept inline so the two storage paths stay independent. */
function dateReviver(key: string, value: unknown): unknown {
  if (
    typeof value === 'string' &&
    (key === 'start' || key === 'end' || key === 'startAt' || key === 'endAt')
  ) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  }
  return value;
}

/** Encode a UTF-8 string to URL-safe base64 (no `+`, `/`, `=`). Uses
 *  TextEncoder so non-ASCII (é, à, ñ in productName) survives the round
 *  trip — plain btoa(str) would throw on those. */
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  // btoa needs a binary string; build it in chunks to avoid blowing the
  // call-stack on long inputs (apply-style spread is bounded ~100k args).
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Build a fully-qualified share URL for the given result. Preserves the
 *  current pathname (so `?company=...` flows could be added later without
 *  rewriting this helper) but replaces the entire query string. */
export function buildShareUrl(result: ScheduleResult): string {
  if (typeof window === 'undefined') return '';
  const payload = toBase64Url(JSON.stringify(result));
  const url = new URL(window.location.href);
  url.search = `?${QUERY_KEY}=${payload}`;
  // Drop the hash — share URLs land at the top of the page.
  url.hash = '';
  return url.toString();
}

/** Pull a saved result off `?calc=...` if present. Returns null on missing
 *  param, malformed base64, JSON parse failure, or anything that doesn't
 *  look like a ScheduleResult after decoding. */
export function readResultFromUrl(): ScheduleResult | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(QUERY_KEY);
  if (!raw) return null;
  try {
    const json = fromBase64Url(raw);
    const parsed = JSON.parse(json, dateReviver) as ScheduleResult;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.rows) ||
      !(parsed.startAt instanceof Date) ||
      !(parsed.endAt instanceof Date) ||
      (parsed.mode !== 'sheets' && parsed.mode !== 'profiles')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Strip the `?calc=...` param from the URL bar without reloading. Other
 *  query params (e.g. `?company=acme`) are preserved. Called after the
 *  result has been hoisted into React state so refresh / share-this-page
 *  doesn't re-trigger restore in a confusing way. */
export function clearResultFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(QUERY_KEY)) return;
  url.searchParams.delete(QUERY_KEY);
  window.history.replaceState(null, '', url.toString());
}
