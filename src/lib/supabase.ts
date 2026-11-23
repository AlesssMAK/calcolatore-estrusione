import { createClient } from '@supabase/supabase-js';
import {
  authLandingPath,
  readUrlAuth,
  setRecoveryPending,
  type UrlAuth,
} from './authUrl';

// Read from Vite env vars (VITE_ prefix is exposed to the client by design;
// the publishable/anon key is meant to be public — RLS keeps the data safe).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** The email link this page load came from (a password reset) — read before
 *  the client below takes its tokens out of the URL. */
export const urlAuth: UrlAuth =
  typeof window === 'undefined' ? { recovery: false } : readUrlAuth(window.location.href);
if (urlAuth.recovery) setRecoveryPending(true);
// A reset link landing on another page (the site's root): to the reset page
// now — before the router starts and before the client below reads the URL
// (it does so a moment later), so the tokens go along.
if (typeof window !== 'undefined') {
  const landing = authLandingPath(window.location.href);
  if (landing) window.history.replaceState(window.history.state, '', landing);
}

// `null` when the project is built without Supabase configured — the app
// keeps working as a stand-alone calculator (no catalog dropdown).
// persistSession=true is needed for /admin login to survive a page reload.
// The default (implicit) flow on purpose: a reset link asked for in the
// installed app opens in the browser, which the PKCE flow would refuse.
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;
