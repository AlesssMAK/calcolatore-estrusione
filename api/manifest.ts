// The PWA manifest of one company: GET /api/manifest?company=<slug>.
//
// The static /manifest.webmanifest starts at "/", so an app installed from a
// company link would open the clean calculator. Its company has to come from a
// real same-origin file: the site's CSP refuses a blob: manifest, and the file
// must be in place before a browser reads it (public/pwa-boot.js points the
// page here while the <head> is parsed).
//
// Self-contained on purpose: Vercel makes a function of every file in /api, and
// its ESM output doesn't resolve extensionless imports.

interface Manifest {
  name?: string;
  [key: string]: unknown;
}

/** The company's display name; null when it can't be told. */
async function companyName(slug: string): Promise<string | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=name&limit=1`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { name?: string }[];
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function staticManifest(url: URL): Promise<Manifest | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as Manifest) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const staticUrl = new URL('/manifest.webmanifest', url);
  const slug = url.searchParams.get('company');
  if (!slug) return Response.redirect(staticUrl, 302);

  const [base, name] = await Promise.all([staticManifest(staticUrl), companyName(slug)]);
  // No manifest at all still keeps the company (an iPhone then installs the
  // page's own address); falling back to the static one would drop it.
  if (!base) return new Response(null, { status: 503 });

  const startUrl = `/?company=${encodeURIComponent(slug)}`;
  const manifest = {
    ...base,
    id: startUrl, // a separate install per company
    start_url: startUrl,
    ...(name ? { name: `${base.name} — ${name}`, short_name: name } : {}),
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json',
      'cache-control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
