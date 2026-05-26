import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';

// Non-nullable per analog-guest migrations: `email NOT NULL UNIQUE` (001),
// `phone_number NOT NULL` (021 step 10). Dual `auth_user_id_*` columns from
// 021 — both nullable but DB CHECK ensures at least one is set per row.
const OperatorSchema = z
  .object({
    id: z.string().uuid(),
    phone_number: z.string(),
    email: z.string().email(),
    auth_user_id_phone: z.string().uuid().nullable(),
    auth_user_id_email: z.string().uuid().nullable(),
  })
  .passthrough();

export type Operator = z.infer<typeof OperatorSchema>;

export type LinkOperatorResult =
  | { ok: true; operator: Operator }
  | { ok: false; error: 'not_provisioned' | 'rpc_failed' | 'invalid_response' };

export type GetOperatorResult =
  | { ok: true; operator: Operator }
  | {
      ok: false;
      error: 'no_session' | 'not_provisioned' | 'rpc_failed' | 'invalid_response';
    };

export type FetchOperatorVenueIdsResult =
  | { ok: true; venueIds: string[] }
  | { ok: false; error: 'rpc_failed' | 'invalid_response' };

let cachedOperator: Operator | null = null;
let cachedVenueIds: { operatorId: string; ids: string[] } | null = null;

export async function linkOperator(args: {
  phone?: string;
  email?: string;
}): Promise<LinkOperatorResult> {
  const { data, error } = await supabase
    .rpc('link_operator_auth', {
      p_phone: args.phone ?? null,
      p_email: args.email ?? null,
    })
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'rpc_failed' };
  }
  if (data === null) {
    return { ok: false, error: 'not_provisioned' };
  }

  const parsed = OperatorSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_response' };
  }
  cachedOperator = parsed.data;
  return { ok: true, operator: parsed.data };
}

/**
 * Resolve the operator row for the active session. Reads the cache populated
 * by `linkOperator()` after sign-in; on cold launch (cache empty but session
 * restored from SecureStore), falls back to a Supabase lookup where
 * `session.user.id` is matched against either `auth_user_id_phone` or
 * `auth_user_id_email`. Mirrors the OR semantics in the operators RLS policy
 * (analog-guest migration 021).
 */
export async function getOperator(): Promise<GetOperatorResult> {
  if (cachedOperator) return { ok: true, operator: cachedOperator };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user.id) return { ok: false, error: 'no_session' };

  const { data, error } = await supabase
    .from('operators')
    .select('id, phone_number, email, auth_user_id_phone, auth_user_id_email')
    .or(
      `auth_user_id_phone.eq.${session.user.id},auth_user_id_email.eq.${session.user.id}`,
    )
    .maybeSingle();
  if (error) return { ok: false, error: 'rpc_failed' };
  if (!data) return { ok: false, error: 'not_provisioned' };

  const parsed = OperatorSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: 'invalid_response' };

  cachedOperator = parsed.data;
  return { ok: true, operator: parsed.data };
}

/**
 * Returns the operator's venue allowlist. Used by the realtime subscription's
 * server-side `venue_id` filter — the only thing keeping cross-venue events
 * out of an operator's stream while RLS is deferred (see TAC-271).
 *
 * v1: direct client read; protected by trusted-client assumption.
 * TAC-271 will add RLS to make this a defense-in-depth read.
 */
export async function fetchOperatorVenueIds(
  operatorId: string,
): Promise<FetchOperatorVenueIdsResult> {
  if (cachedVenueIds && cachedVenueIds.operatorId === operatorId) {
    return { ok: true, venueIds: cachedVenueIds.ids };
  }

  const { data, error } = await supabase
    .from('operator_venues')
    .select('venue_id')
    .eq('operator_id', operatorId);
  if (error) return { ok: false, error: 'rpc_failed' };

  const rowsSchema = z.array(z.object({ venue_id: z.string().uuid() }));
  const parsed = rowsSchema.safeParse(data ?? []);
  if (!parsed.success) return { ok: false, error: 'invalid_response' };

  const ids = parsed.data.map((r) => r.venue_id);
  cachedVenueIds = { operatorId, ids };
  return { ok: true, venueIds: ids };
}

export function clearOperatorCache(): void {
  cachedOperator = null;
  cachedVenueIds = null;
}

/**
 * Subscribe to Supabase auth events and clear the module-level operator/venue
 * cache on sign-out. Returns a teardown to be called from the root layout's
 * effect cleanup. Safe to call multiple times — each call gets its own
 * subscription.
 */
export function wireOperatorCacheClear(): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') clearOperatorCache();
  });
  return () => data.subscription.unsubscribe();
}
