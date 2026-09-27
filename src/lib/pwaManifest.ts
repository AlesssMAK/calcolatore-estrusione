// Per-company PWA manifest.
//
// The static /manifest.webmanifest has `start_url: "/"`, so a PWA installed from
// a company page (?company=<slug>) would launch the *clean* calculator, dropping
// the company. Here we swap the <link rel="manifest"> for an in-memory manifest
// whose start_url carries the slug, and give the installed app a distinct id +
// the company name — so "Add to Home Screen" installs *that company's* app.
//
// Works on Android/desktop Chromium and iOS 16.4+ (which reads the manifest at
// install time). Older iOS ignores the manifest and uses the current page URL,
// which already carries ?company= — so either way the company is preserved.

let appliedSlug: string | null = null;

export async function applyCompanyManifest(company: {
  slug: string;
  name: string;
}): Promise<void> {
  if (typeof document === 'undefined') return;
  if (appliedSlug === company.slug) return; // already applied this session
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return;

  const startUrl = `/?company=${encodeURIComponent(company.slug)}`;
  try {
    const res = await fetch(link.href, { cache: 'force-cache' });
    const base = (await res.json()) as Record<string, unknown>;
    const manifest = {
      ...base,
      id: startUrl, // distinct install identity per company
      start_url: startUrl,
      name: `${base.name ?? 'Calcolatore di Estrusione'} — ${company.name}`,
      short_name: company.name,
    };
    const blob = new Blob([JSON.stringify(manifest)], {
      type: 'application/manifest+json',
    });
    link.href = URL.createObjectURL(blob);
    appliedSlug = company.slug;
  } catch {
    /* keep the static manifest on any failure */
  }

  // iOS uses this meta (not the manifest) for the home-screen label.
  const appleTitle = document.querySelector<HTMLMetaElement>(
    'meta[name="apple-mobile-web-app-title"]',
  );
  if (appleTitle) appleTitle.content = company.name;
}
