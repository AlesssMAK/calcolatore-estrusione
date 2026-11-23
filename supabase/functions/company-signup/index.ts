// Supabase Edge Function «company-signup» — a company signs itself up, the
// super-admin approves it (Admin → Aziende).
//
//   register  (public)      name, email, phone?, password, captcha
//             → a pending company + its admin account (email not confirmed)
//               + an email with the confirmation link
//   confirm   (public)      token (from the link)
//             → the email confirmed; the super-admin gets an email
//   approve / reject (super-admin's session)   company_id
//             → active / deleted; the company gets an email
//
// Deploy: Supabase → Edge Functions → Deploy a new function → name
// «company-signup», paste this file, Deploy; then the function's Details →
// «Verify JWT with legacy secret» OFF (register/confirm are public — the
// CAPTCHA guards register; approve/reject check the caller's session here).
// Secrets (Edge Functions → Secrets): BREVO_API_KEY, TURNSTILE_SECRET_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are there already.
// Needs the SQL in supabase/sql/2026-11-23-company-signup.sql.

import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_ORIGIN = 'https://extrusion-calculator.com';
/** Where the browser may call from; links in the emails go back there. */
const ORIGINS = [
  APP_ORIGIN,
  'https://www.extrusion-calculator.com',
  'http://localhost:5173',
];
const SENDER = {
  name: 'Extrusion Calculator',
  email: 'noreply@extrusion-calculator.com',
};
/** How long the confirmation link works. */
const LINK_HOURS = 48;
/** Sign-ups per hour, all together — keeps a flood off the email quota. */
const MAX_SIGNUPS_PER_HOUR = 20;
/** An unconfirmed sign-up this long past its link's expiry is removed. */
const STALE_DAYS = 7;

const EMAIL_RE = /^[^\s@,;()<>"]+@[^\s@,;()<>"]+\.[^\s@,;()<>"]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()./-]{6,20}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,100}$/;

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Body = Record<string, unknown>;
type Reply = (status: number, body: Record<string, unknown>) => Response;

Deno.serve(async req => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin)
      ? origin
      : APP_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply: Reply = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  if (req.method !== 'POST')
    return reply(405, { error: 'Metodo non consentito' });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Richiesta non valida' });
  }
  const linkOrigin = ORIGINS.includes(origin) ? origin : APP_ORIGIN;
  try {
    switch (body.action) {
      case 'register':
        return await register(req, body, linkOrigin, reply);
      case 'confirm':
        return await confirm(body, reply);
      case 'approve':
      case 'reject':
        return await review(req, body, reply);
      default:
        return reply(400, { error: 'Azione sconosciuta' });
    }
  } catch (e) {
    console.error('[company-signup]', body.action, e);
    return reply(500, { error: 'Errore del server: riprova più tardi' });
  }
});

// ---------------------------------------------------------------- register

async function register(
  req: Request,
  body: Body,
  linkOrigin: string,
  reply: Reply
) {
  const name = text(body.name).replace(/\s+/g, ' ').trim();
  const email = text(body.email).trim().toLowerCase();
  const phone = text(body.phone).trim();
  const password = typeof body.password === 'string' ? body.password : '';
  if (name.length < 2 || name.length > 80)
    return reply(400, {
      error: 'Il nome dell’azienda deve avere da 2 a 80 caratteri',
    });
  if (email.length > 254 || !EMAIL_RE.test(email))
    return reply(400, { error: 'Indirizzo email non valido' });
  if (phone && !PHONE_RE.test(phone))
    return reply(400, { error: 'Numero di telefono non valido' });
  if (password.length < 8 || password.length > 72)
    return reply(400, { error: 'La password deve avere da 8 a 72 caratteri' });
  if (!(await captchaOk(text(body.captcha), clientIp(req))))
    return reply(400, {
      error: 'Verifica anti-bot non riuscita: riprova',
      code: 'captcha',
    });

  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await db
    .from('company_signups')
    .select('company_id', { count: 'exact', head: true })
    .gte('requested_at', hourAgo);
  if ((count ?? 0) >= MAX_SIGNUPS_PER_HOUR)
    return reply(429, {
      error: 'Troppe registrazioni in questo momento: riprova tra un’ora',
    });

  // An earlier attempt with this email that was never confirmed gives way
  // (its link went to the same inbox); long-expired ones go too.
  await dropUnconfirmed(email);

  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { signup: 'company' },
  });
  if (userErr || !created.user) {
    // Already has an account: the same answer as a new one, so the form
    // doesn't tell who is registered (they sign in or reset the password).
    if (
      userErr?.code === 'email_exists' ||
      /already/i.test(userErr?.message ?? '')
    )
      return reply(200, { ok: true });
    if (userErr?.code === 'weak_password')
      return reply(400, {
        error: 'Password troppo debole: allungala o aggiungi numeri e simboli',
      });
    throw userErr;
  }
  const userId = created.user.id;

  const slug = await freeSlug(slugify(name));
  const { data: company, error: companyErr } = await db
    .from('companies')
    .insert({ slug, name, status: 'pending' })
    .select('id')
    .single();
  if (companyErr || !company) {
    await db.auth.admin.deleteUser(userId);
    throw companyErr;
  }

  const token = randomToken();
  const { error: adminErr } = await db
    .from('admins')
    .insert({ user_id: userId, company_id: company.id, is_super: false });
  const { error: signupErr } = adminErr
    ? { error: null }
    : await db.from('company_signups').insert({
        company_id: company.id,
        user_id: userId,
        email,
        phone: phone || null,
        token_hash: await sha256(token),
        token_expires_at: new Date(
          Date.now() + LINK_HOURS * 3600e3
        ).toISOString(),
      });
  if (adminErr || signupErr) {
    await removeCompany(company.id, [userId]);
    throw adminErr ?? signupErr;
  }

  const link = `${linkOrigin}/admin/conferma#t=${token}`;
  const sent = await sendMail(
    [email],
    'Conferma la registrazione',
    mail(
      'Conferma la tua email',
      [
        `Hai registrato <strong>${esc(name)}</strong> su Extrusion Calculator.`,
        'Apri il link qui sotto per confermare l’indirizzo. Poi verificheremo la richiesta e ti scriveremo quando l’azienda sarà attiva.',
        `Il link vale ${LINK_HOURS} ore. Se la richiesta non è tua, ignora questa email.`,
      ],
      { label: 'Conferma email', href: link }
    )
  );
  if (!sent) {
    await removeCompany(company.id, [userId]);
    return reply(502, {
      error: 'Invio dell’email non riuscito: riprova più tardi',
    });
  }
  return reply(200, { ok: true });
}

// ----------------------------------------------------------------- confirm

async function confirm(body: Body, reply: Reply) {
  const token = text(body.token);
  if (!TOKEN_RE.test(token))
    return reply(400, { error: 'Link non valido', code: 'invalid' });
  const { data: signup } = await db
    .from('company_signups')
    .select(
      'company_id, user_id, email, phone, token_expires_at, email_confirmed_at'
    )
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!signup) return reply(404, { error: 'Link non valido', code: 'invalid' });
  const { data: company } = await db
    .from('companies')
    .select('name, slug, status')
    .eq('id', signup.company_id)
    .maybeSingle();
  const name = company?.name ?? '';
  if (signup.email_confirmed_at)
    return reply(200, {
      ok: true,
      name,
      already: true,
      active: company?.status === 'active',
    });
  if (new Date(signup.token_expires_at).getTime() < Date.now())
    return reply(410, { error: 'Link scaduto', code: 'expired' });

  // Claimed by one opening of the link only (two at once: one email to you).
  const { data: claimed, error: rowErr } = await db
    .from('company_signups')
    .update({ email_confirmed_at: new Date().toISOString() })
    .eq('company_id', signup.company_id)
    .is('email_confirmed_at', null)
    .select('company_id');
  if (rowErr) throw rowErr;
  if (!claimed?.length)
    return reply(200, {
      ok: true,
      name,
      already: true,
      active: company?.status === 'active',
    });
  const { error: userErr } = await db.auth.admin.updateUserById(
    signup.user_id,
    {
      email_confirm: true,
    }
  );
  if (userErr) {
    await db
      .from('company_signups')
      .update({ email_confirmed_at: null })
      .eq('company_id', signup.company_id);
    throw userErr;
  }

  // To the super-admin(s): a company to look at. A failure here doesn't undo
  // the confirmation — the request shows in «Aziende» anyway.
  const supers = await superEmails();
  if (supers.length)
    await sendMail(
      supers,
      `Nuova azienda da approvare: ${name}`,
      mail(
        'Nuova azienda in attesa',
        [
          `<strong>${esc(name)}</strong> si è registrata e ha confermato l’email.`,
          `Email: ${esc(signup.email)}<br>Telefono: ${esc(signup.phone ?? '—')}<br>Link: ${esc(`${APP_ORIGIN}/?company=${company?.slug ?? ''}`)}`,
          'Controlla la richiesta e approvala o rifiutala in Admin → Aziende.',
        ],
        { label: 'Apri Aziende', href: `${APP_ORIGIN}/admin?tab=aziende` }
      )
    );
  return reply(200, { ok: true, name });
}

// ------------------------------------------------------- approve / reject

async function review(req: Request, body: Body, reply: Reply) {
  if (!(await callerIsSuper(req)))
    return reply(403, { error: 'Solo il super-admin può farlo' });
  const companyId = text(body.company_id);
  const { data: company } = await db
    .from('companies')
    .select('id, name, slug, status')
    .eq('id', companyId)
    .maybeSingle();
  if (!company) return reply(404, { error: 'Azienda non trovata' });
  if (company.status !== 'pending')
    return reply(409, {
      error: 'Questa azienda non è in attesa di approvazione',
    });
  const { data: signup } = await db
    .from('company_signups')
    .select('user_id, email, email_confirmed_at')
    .eq('company_id', companyId)
    .maybeSingle();

  if (body.action === 'approve') {
    // The account's owner must have shown the inbox is theirs.
    if (!signup?.email_confirmed_at)
      return reply(409, { error: 'L’email non è ancora stata confermata' });
    const { error } = await db
      .from('companies')
      .update({ status: 'active' })
      .eq('id', companyId);
    if (error) throw error;
    await db
      .from('company_signups')
      .update({ approved_at: new Date().toISOString() })
      .eq('company_id', companyId);
    await sendMail(
      [signup.email],
      'La tua azienda è attiva',
      mail(
        'Azienda approvata',
        [
          `<strong>${esc(company.name)}</strong> è attiva su Extrusion Calculator.`,
          'Accedi al pannello admin con la tua email e la password scelta: aggiungi i prodotti e le impostazioni dell’azienda.',
          `Il calcolatore della tua azienda: ${esc(`${APP_ORIGIN}/?company=${company.slug}`)}`,
        ],
        { label: 'Accedi', href: `${APP_ORIGIN}/admin/login` }
      )
    );
    return reply(200, { ok: true });
  }

  const { data: admins } = await db
    .from('admins')
    .select('user_id')
    .eq('company_id', companyId);
  const users = new Set((admins ?? []).map(a => a.user_id as string));
  if (signup?.user_id) users.add(signup.user_id);
  await removeCompany(companyId, [...users]);
  if (signup?.email_confirmed_at)
    await sendMail(
      [signup.email],
      'Richiesta di registrazione',
      mail('Richiesta non approvata', [
        `La richiesta per <strong>${esc(company.name)}</strong> non è stata approvata e l’account è stato rimosso.`,
        'Pensi che sia un errore? Rispondi pure a questa email o registrati di nuovo con i dati corretti.',
      ])
    );
  return reply(200, { ok: true });
}

// ----------------------------------------------------------------- helpers

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}

async function captchaOk(token: string, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret || !token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: form,
    }
  );
  const out = (await res.json().catch(() => null)) as {
    success?: boolean;
  } | null;
  return out?.success === true;
}

async function callerIsSuper(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('authorization') ?? '').replace(
    /^Bearer\s+/i,
    ''
  );
  if (!jwt) return false;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return false;
  const { data: row } = await db
    .from('admins')
    .select('is_super')
    .eq('user_id', data.user.id)
    .maybeSingle();
  return row?.is_super === true;
}

async function superEmails(): Promise<string[]> {
  const { data } = await db
    .from('admins')
    .select('user_id')
    .eq('is_super', true);
  const out: string[] = [];
  for (const row of data ?? []) {
    const { data: u } = await db.auth.admin.getUserById(row.user_id as string);
    if (u?.user?.email) out.push(u.user.email);
  }
  return out;
}

/** Unconfirmed sign-ups with this email, and long-expired unconfirmed ones. */
async function dropUnconfirmed(email: string) {
  const cutoff = new Date(Date.now() - STALE_DAYS * 864e5).toISOString();
  const [sameEmail, stale] = await Promise.all([
    db
      .from('company_signups')
      .select('company_id, user_id')
      .is('email_confirmed_at', null)
      .eq('email', email),
    db
      .from('company_signups')
      .select('company_id, user_id')
      .is('email_confirmed_at', null)
      .lt('token_expires_at', cutoff)
      .limit(20),
  ]);
  const rows = [...(sameEmail.data ?? []), ...(stale.data ?? [])];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.company_id)) continue;
    seen.add(r.company_id);
    // Only a company still waiting — never one approved meanwhile.
    const { data: c } = await db
      .from('companies')
      .select('status')
      .eq('id', r.company_id)
      .maybeSingle();
    if (c?.status === 'pending') await removeCompany(r.company_id, [r.user_id]);
  }
}

/** A company with everything of it, and its accounts. */
async function removeCompany(companyId: string, userIds: string[]) {
  await db.from('products').delete().eq('company_id', companyId);
  await db.from('company_settings').delete().eq('company_id', companyId);
  await db.from('admins').delete().eq('company_id', companyId);
  await db.from('companies').delete().eq('id', companyId); // company_signups cascades
  for (const id of userIds) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) console.error('[company-signup] deleteUser', id, error.message);
  }
}

function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return s.length >= 2 ? s : 'azienda';
}

/** The slug, or the first of slug-2, slug-3… nobody has. */
async function freeSlug(base: string): Promise<string> {
  const { data } = await db
    .from('companies')
    .select('slug')
    .like('slug', `${base}%`);
  const taken = new Set((data ?? []).map(r => r.slug as string));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(s)
  );
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A plain email: a title, paragraphs (HTML, values escaped by the caller),
 *  an optional button — with a text version. */
function mail(
  title: string,
  paragraphs: string[],
  button?: { label: string; href: string }
): { html: string; text: string } {
  const p = paragraphs
    .map(
      x =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1f2937">${x}</p>`
    )
    .join('');
  const b = button
    ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#c8102e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 22px;border-radius:8px">${esc(button.label)}</a></p>` +
      `<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#6b7280">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><span style="word-break:break-all">${esc(button.href)}</span></p>`
    : '';
  const html =
    `<!doctype html><html lang="it"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">` +
    `<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border-radius:12px;padding:24px">` +
    `<h1 style="margin:0 0 16px;font-size:20px;color:#111827">${esc(title)}</h1>${p}${b}` +
    `</div><p style="margin:12px 0 0;text-align:center;font-size:12px;color:#9ca3af">Extrusion Calculator · extrusion-calculator.com</p></div></body></html>`;
  const text = [
    title,
    '',
    ...paragraphs.map(x =>
      x
        .replace(/<br>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    ),
    ...(button ? ['', `${button.label}: ${button.href}`] : []),
  ].join('\n');
  return { html, text };
}

async function sendMail(
  to: string[],
  subject: string,
  content: { html: string; text: string }
): Promise<boolean> {
  const key = Deno.env.get('BREVO_API_KEY');
  if (!key) {
    console.error('[company-signup] BREVO_API_KEY is not set');
    return false;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': key,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: SENDER,
      to: to.map(email => ({ email })),
      subject,
      htmlContent: content.html,
      textContent: content.text,
    }),
  });
  if (!res.ok)
    console.error('[company-signup] brevo', res.status, await res.text());
  return res.ok;
}
