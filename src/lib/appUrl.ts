/**
 * Canonical public origin for building shareable links (the company links the
 * admin copies with "Copia"). Fixed to the production domain so a copied link
 * always points there, no matter where the admin panel was opened (vercel.app
 * preview, localhost, the custom domain…). Override with VITE_APP_BASE_URL.
 */
export const APP_ORIGIN = (
  import.meta.env.VITE_APP_BASE_URL ?? 'https://extrusion-calculator.com'
).replace(/\/+$/, '');

/** Absolute shareable URL for a company's calculator (or the base calculator
 *  when slug is empty). */
export function companyUrl(slug?: string): string {
  return slug
    ? `${APP_ORIGIN}/?company=${encodeURIComponent(slug)}`
    : `${APP_ORIGIN}/`;
}
