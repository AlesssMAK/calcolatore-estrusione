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

/** A shared calc plus its live-sync metadata (server version + last update). */
export interface SharedFetch {
  payload: SharedPayload;
  /** Monotonic version, bumped on every server-side edit (1 for old rows). */
  version: number;
  /** ISO timestamp of the last edit (null for old rows without the column). */
  updatedAt: string | null;
}

/** Store a calculation and return its short id + secret edit token. The token
 *  is the capability to later edit this row (via `updateSharedCalc`) — the
 *  creator keeps it locally; a share link only carries it when the sharer opts
 *  into a collaborative link. Throws on failure (network / RLS / Supabase not
 *  configured) so the caller can surface an error state. */
export async function createSharedCalc(
  payload: SharedPayload,
): Promise<{ id: string; editToken: string }> {
  if (!supabase) throw new Error('Supabase not configured');
  const id = shortId();
  const editToken = crypto.randomUUID();
  const { error } = await supabase
    .from('shared_calcs')
    .insert({ id, payload, edit_token: editToken });
  if (error) throw error;
  return { id, editToken };
}

/** Overwrite a shared calc's payload — only succeeds when `token` matches the
 *  row's `edit_token` (server-enforced via the `update_shared_calc` RPC).
 *  Returns the new version, or null when the id/token didn't match. */
export async function updateSharedCalc(
  id: string,
  token: string,
  payload: SharedPayload,
): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('update_shared_calc', {
    p_id: id,
    p_token: token,
    p_payload: payload,
  });
  if (error) return null;
  return typeof data === 'number' ? data : null;
}

/** Publish (or unpublish) a shared calc to a company's shared list — only with
 *  the matching edit token. `editable` lets any company member edit it. Returns
 *  true on success. */
export async function setCompanyPublish(
  id: string,
  token: string,
  company: string,
  isPublic: boolean,
  isEditable: boolean,
): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('set_company_publish', {
    p_id: id,
    p_token: token,
    p_company: company,
    p_public: isPublic,
    p_editable: isEditable,
  });
  if (error) return false;
  return data === true;
}

/** Edit a company-published, "editable by anyone" calc — no token needed
 *  (server gates on is_public && is_editable). Returns the new version. */
export async function updateCompanyCalc(
  id: string,
  payload: SharedPayload,
): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('update_company_calc', {
    p_id: id,
    p_payload: payload,
  });
  if (error) return null;
  return typeof data === 'number' ? data : null;
}

/** One entry in a company's shared-results list. */
export interface CompanyCalc {
  id: string;
  payload: SharedPayload;
  version: number;
  updatedAt: string | null;
  isEditable: boolean;
}

/** List the calcs a company has published (view + follow). Empty on error. */
export async function fetchCompanyCalcs(
  company: string,
): Promise<CompanyCalc[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_company_calcs', {
    p_company: company,
  });
  if (error || !Array.isArray(data)) return [];
  const out: CompanyCalc[] = [];
  for (const row of data as {
    id: string;
    payload: unknown;
    version: number;
    updated_at: string;
    is_editable: boolean;
  }[]) {
    try {
      out.push({
        id: row.id,
        payload: revivePayload(row.payload),
        version: typeof row.version === 'number' ? row.version : 1,
        updatedAt: row.updated_at ?? null,
        isEditable: row.is_editable === true,
      });
    } catch {
      /* skip malformed rows */
    }
  }
  return out;
}

/** Fetch a shared calculation by id + its sync metadata. Returns null when
 *  missing / on error, so a bad or expired link degrades to the normal empty
 *  calculator.
 *
 *  Reads through the `get_shared_calc_meta(p_id)` RPC (payload + version +
 *  updated_at), which returns a single row by exact id — so the table can't be
 *  enumerated/dumped even though the anon key is public. Falls back to the
 *  payload-only `get_shared_calc` (version 1) for rows/links from before the
 *  sync migration. */
export async function fetchSharedCalc(id: string): Promise<SharedFetch | null> {
  if (!supabase) return null;
  let payloadRaw: unknown = null;
  let version = 1;
  let updatedAt: string | null = null;

  const meta = await supabase.rpc('get_shared_calc_meta', { p_id: id });
  if (!meta.error && meta.data) {
    const row = meta.data as {
      payload?: unknown;
      version?: number;
      updated_at?: string;
    };
    payloadRaw = row.payload ?? null;
    if (typeof row.version === 'number') version = row.version;
    updatedAt = row.updated_at ?? null;
  } else {
    // Older deployment: payload-only function.
    const rpc = await supabase.rpc('get_shared_calc', { p_id: id });
    if (!rpc.error) payloadRaw = rpc.data ?? null;
  }

  if (!payloadRaw) return null;
  try {
    return { payload: revivePayload(payloadRaw), version, updatedAt };
  } catch {
    return null;
  }
}
