import { createClient } from '@supabase/supabase-js';

// Read from Vite env vars (VITE_ prefix is exposed to the client by design;
// the publishable/anon key is meant to be public — RLS keeps the data safe).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// `null` when the project is built without Supabase configured — the app
// keeps working as a stand-alone calculator (no catalog dropdown).
// persistSession=true is needed for /admin login to survive a page reload.
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;
