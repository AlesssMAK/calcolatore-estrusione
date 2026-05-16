import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  /** Logged-in Supabase user, or null when anonymous. */
  user: User | null;
  /** Company id this admin can manage (from public.admins). Null if the user
   *  isn't mapped to any company. */
  companyId: string | null;
  /** True while we resolve the initial session + admin mapping. */
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  companyId: null,
  loading: false,
  signIn: async () => ({ ok: false, error: 'auth not configured' }),
  signOut: async () => {},
});

async function resolveCompanyId(userId: string | null): Promise<string | null> {
  if (!userId || !supabase) return null;
  const { data, error } = await supabase
    .from('admins')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[auth] resolveCompanyId failed', error);
    return null;
  }
  return data?.company_id ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  'use no memo';
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate current session + listen for changes (sign-in, sign-out, refresh).
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      await applySession(session);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    async function applySession(session: Session | null) {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      const cId = await resolveCompanyId(nextUser?.id ?? null);
      if (cancelled) return;
      setCompanyId(cId);
      setLoading(false);
    }

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { ok: false, error: 'Supabase non configurato' };
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, companyId, loading, signIn, signOut }),
    [user, companyId, loading, signIn, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
