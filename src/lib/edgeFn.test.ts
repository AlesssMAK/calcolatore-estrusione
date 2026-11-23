import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fnFailure } from './edgeFn';

vi.mock('./supabase', () => ({ supabase: null }));

describe('fnFailure — an Edge Function refusing, in its own words', () => {
  it('its answer says why (and a code to act on)', async () => {
    const res = new Response(
      JSON.stringify({ error: 'Link scaduto', code: 'expired' }),
      { status: 410 }
    );
    expect(await fnFailure(new FunctionsHttpError(res))).toEqual({
      error: 'Link scaduto',
      code: 'expired',
      status: 410,
    });
  });

  it('an answer without a message', async () => {
    const res = new Response('boom', { status: 500 });
    expect(await fnFailure(new FunctionsHttpError(res))).toMatchObject({
      error: 'Errore del server: riprova',
      status: 500,
    });
  });

  it('no answer at all', async () => {
    expect(await fnFailure(new FunctionsFetchError(new Error('x')))).toEqual({
      error: 'Nessuna connessione: riprova',
    });
  });
});
