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
import { setRecoveryPending } from '../lib/authUrl';
import { authErrorText } from '../lib/password';

interface AdminInfo {
  companyId: string | null;
  isSuper: boolean;
}

interface AuthState {
  /** Logged-in Supabase user, or null when anonymous. */
  user: User | null;
  /** Company id this admin can manage (from public.admins). Null if the user
   *  isn't mapped to any company. */
  companyId: string | null;
  /** True when the user has is_super=true — unlocks the Aziende tab. */
  isSuper: boolean;
  /** True while we resolve the initial session + admin mapping. */
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  /** Emails a link to choose a new password (the page /admin/reset). */
  sendPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Sets the signed-in user's password; with `current`, checks it first. */
  updatePassword: (
    password: string,
    current?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  companyId: null,
  isSuper: false,
  loading: false,
  signIn: async () => ({ ok: false, error: 'auth not configured' }),
  signOut: async () => {},
  sendPasswordReset: async () => ({ ok: false, error: 'auth not configured' }),
  updatePassword: async () => ({ ok: false, error: 'auth not configured' }),
});

async function resolveAdminInfo(userId: string | null): Promise<AdminInfo> {
  if (!userId || !supabase) return { companyId: null, isSuper: false };
  const { data, error } = await supabase
    .from('admins')
    .select('company_id, is_super')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[auth] resolveAdminInfo failed', error);
    return { companyId: null, isSuper: false };
  }
  return {
    companyId: data?.company_id ?? null,
    isSuper: Boolean(data?.is_super),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  'use no memo';
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isSuper, setIsSuper] = useState(false);
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
      const info = await resolveAdminInfo(nextUser?.id ?? null);
      if (cancelled) return;
      setCompanyId(info.companyId);
      setIsSuper(info.isSuper);
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
      if (error) return { ok: false, error: authErrorText(error) };
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setRecoveryPending(false);
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato' };
    // Back to the address it was asked from (the site, a preview, localhost —
    // each listed among the project's redirect URLs).
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/reset`,
    });
    if (error) return { ok: false, error: authErrorText(error) };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(
    async (password: string, current?: string) => {
      if (!supabase) return { ok: false, error: 'Supabase non configurato' };
      if (current !== undefined) {
        const email = user?.email;
        if (!email) return { ok: false, error: 'Sessione scaduta: accedi di nuovo' };
        // A wrong password leaves the session as it is.
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        });
        if (error)
          return {
            ok: false,
            error:
              error.code === 'invalid_credentials'
                ? 'La password attuale non è corretta'
                : authErrorText(error),
          };
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { ok: false, error: authErrorText(error) };
      setRecoveryPending(false);
      return { ok: true };
    },
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      companyId,
      isSuper,
      loading,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
    }),
    [user, companyId, isSuper, loading, signIn, signOut, sendPasswordReset, updatePassword],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
