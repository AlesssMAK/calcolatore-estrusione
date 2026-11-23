import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type FnResult<T> = {
  data?: T;
  /** The function's own message ({ error } in its answer) when it refused. */
  error?: string;
  /** Its machine-readable reason ({ code }), when it gave one. */
  code?: string;
  status?: number;
};

/** An Edge Function's refusal as its own words — the client's error says
 *  only "non-2xx status"; the answer's body says why. */
export async function fnFailure(error: unknown): Promise<FnResult<never>> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response | undefined;
    const out = (await res?.json().catch(() => null)) as {
      error?: string;
      message?: string;
      code?: string;
    } | null;
    return {
      error: out?.error ?? out?.message ?? 'Errore del server: riprova',
      code: out?.code,
      status: res?.status,
    };
  }
  if (error instanceof FunctionsFetchError)
    return { error: 'Nessuna connessione: riprova' };
  return {
    error:
      error instanceof Error && error.message
        ? error.message
        : 'Errore sconosciuto',
  };
}

/** Calls a Supabase Edge Function (as the signed-in admin, when there is one). */
export async function invokeFn<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<FnResult<T>> {
  if (!supabase) return { error: 'Supabase non configurato' };
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) return fnFailure(error);
  return { data: data ?? undefined };
}
