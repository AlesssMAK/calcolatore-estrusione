// The "_" keeps this file from becoming a Vercel function.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './manifest';

const SITE = 'https://app.test';
const base = {
  name: 'Calcolatore',
  short_name: 'Estrusione',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  icons: [{ src: '/favicon.png' }],
};

const json = (body: unknown) => new Response(JSON.stringify(body));

/** The site's static manifest, and the company table. */
function serve(rows: unknown = [{ name: 'Akraplast' }], site: unknown = base) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: URL | string) => {
    const url = String(input);
    calls.push(url);
    const answer = url.includes('/rest/v1/') ? rows : site;
    return answer instanceof Response ? answer : json(answer);
  });
  return calls;
}

const get = (query: string) => GET(new Request(`${SITE}/api/manifest${query}`));
const read = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('a company manifest', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('starts the installed app at the company, under its name', async () => {
    serve();
    const res = await get('?company=akra-plast');
    expect(res.headers.get('content-type')).toBe('application/manifest+json');
    expect(await read(res)).toMatchObject({
      id: '/?company=akra-plast',
      start_url: '/?company=akra-plast',
      name: 'Calcolatore — Akraplast',
      short_name: 'Akraplast',
    });
  });

  it('keeps everything else of the static manifest', async () => {
    serve();
    const res = await get('?company=akra-plast');
    expect(await read(res)).toMatchObject({
      scope: '/',
      display: 'standalone',
      icons: base.icons,
    });
  });

  it('escapes the slug, in the lookup and in the address', async () => {
    const calls = serve();
    const res = await get('?company=a%26b%3Dc');
    expect(calls.find((c) => c.includes('/rest/v1/'))).toContain('slug=eq.a%26b%3Dc&');
    expect((await read(res)).start_url).toBe('/?company=a%26b%3Dc');
  });

  it('a failed name lookup still gives the company app', async () => {
    serve(new Response(null, { status: 500 }));
    const body = await read(await get('?company=akra-plast'));
    expect(body.start_url).toBe('/?company=akra-plast');
    expect(body.name).toBe('Calcolatore');
    expect(body.short_name).toBe('Estrusione');
  });

  it('an unknown company keeps the generic name', async () => {
    serve([]);
    const body = await read(await get('?company=nope'));
    expect(body.start_url).toBe('/?company=nope');
    expect(body.short_name).toBe('Estrusione');
  });

  it('without database settings the lookup is skipped', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const calls = serve();
    const body = await read(await get('?company=akra-plast'));
    expect(calls.some((c) => c.includes('/rest/v1/'))).toBe(false);
    expect(body.start_url).toBe('/?company=akra-plast');
  });

  it('never answers with a manifest that drops the company', async () => {
    serve(undefined, new Response(null, { status: 500 }));
    const res = await get('?company=akra-plast');
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('');
  });

  it('no company asked: the static manifest', async () => {
    const calls = serve();
    const res = await get('');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${SITE}/manifest.webmanifest`);
    expect(calls).toEqual([]);
  });
});
