import { supabase } from './supabase';
import { dateReviver } from './calcHistory';
import type { FormValues } from '../formSchema';
import type {
  CalculatorMode,
  ScheduledOrder,
  ScheduleResult,
  ScheduleSnapshot,
} from '../types';

// A whole calculation shared via a short link. Stored as a single jsonb row in
// the Supabase `shared_calcs` table and re-hydrated on the recipient's side
// into filled form fields + the result panel (shown as sent, not advanced) and
// saved into their local "Salvati" history so they keep a copy.
export interface SharedPayload {
  /** Schema version, so an old link stays readable if the shape changes. */
  v: 1;
  mode: CalculatorMode;
  /** Raw form inputs (settings + orders) — refills the form for editing. */
  values: FormValues;
  /** Computed schedule — restored verbatim into the ResultsPanel (base rows;
   *  any completed orders are kept separately in `completedRows`). */
  result: ScheduleResult;
  /** Orders already completed as of the shared moment (shown as done). */
  completedRows?: ScheduledOrder[];
  /** Human label (product name / timestamp) — currently informational. */
  label?: string;
  /** Effective schedule + buffers used for the calc. Carried so the saved copy
   *  can be advanced to "now" / recalculated later, exactly like a locally
   *  saved calculation. Optional for links created before this field existed. */
  snapshot?: ScheduleSnapshot;
}

// Short, link-friendly id. 10 chars from a 32-symbol alphabet (~50 bits) with
// ambiguous characters (0/o/1/l) removed so the id survives being read aloud
// or retyped. Collisions are astronomically unlikely at this scale.
function shortId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Revive Date fields inside a payload fetched from Supabase (which returns
 *  already-parsed JSON, so the reviver is run over a re-serialized copy). Also
 *  keeps `values.settings.startAt` as an ISO string, which the form expects. */
function revivePayload(raw: unknown): SharedPayload {
  const revived = JSON.parse(JSON.stringify(raw), dateReviver) as SharedPayload;
  const s = revived?.values?.settings as { startAt?: unknown } | undefined;
  if (s?.startAt instanceof Date) s.startAt = s.startAt.toISOString();
  return revived;
}

/** Store a calculation and return its short id. Throws on failure (network /
 *  RLS / Supabase not configured) so the caller can surface an error state. */
export async function createSharedCalc(payload: SharedPayload): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');
  const id = shortId();
  const { error } = await supabase
    .from('shared_calcs')
    .insert({ id, payload });
  if (error) throw error;
  return id;
}

/** Fetch a shared calculation by id. Returns null when missing / on error, so
 *  a bad or expired link degrades to the normal empty calculator.
 *
 *  Reads through the `get_shared_calc(p_id)` RPC, which returns a single row by
 *  exact id — so the table can't be enumerated/dumped even though the anon key
 *  is public. Falls back to a direct read for deployments where that function
 *  isn't set up yet (keeps links working during the migration). */
export async function fetchSharedCalc(
  id: string,
): Promise<SharedPayload | null> {
  if (!supabase) return null;
  let payload: unknown = null;
  const rpc = await supabase.rpc('get_shared_calc', { p_id: id });
  if (!rpc.error) {
    payload = rpc.data ?? null;
  } else {
    const sel = await supabase
      .from('shared_calcs')
      .select('payload')
      .eq('id', id)
      .maybeSingle();
    if (!sel.error) payload = sel.data?.payload ?? null;
  }
  if (!payload) return null;
  try {
    return revivePayload(payload);
  } catch {
    return null;
  }
}
