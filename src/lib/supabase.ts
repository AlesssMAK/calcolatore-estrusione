import { createClient } from '@supabase/supabase-js';
import { readUrlAuth, setRecoveryPending, type UrlAuth } from './authUrl';

// Read from Vite env vars (VITE_ prefix is exposed to the client by design;
// the publishable/anon key is meant to be public — RLS keeps the data safe).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** The email link this page load came from (a password reset) — read before
 *  the client below takes its tokens out of the URL. */
export const urlAuth: UrlAuth =
  typeof window === 'undefined' ? { recovery: false } : readUrlAuth(window.location.href);
if (urlAuth.recovery) setRecoveryPending(true);

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
