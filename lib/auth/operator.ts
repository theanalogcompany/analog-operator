import { z } from 'zod';

import { isFixtureMode } from '@/lib/api/queue';
import {
  FIXTURE_OPERATOR_ID,
  FIXTURE_VENUES,
} from '@/lib/fixtures/venues';
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

// All four columns are NOT NULL in the `venues` table (verified against the
// live schema during TAC-382), so none of them is modelled as nullable here.
const VenueSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
});

export type Venue = z.infer<typeof VenueSchema>;

// `operator_venues.venue_id` is a to-one foreign key
// (`operator_venues_venue_id_fkey` -> `venues`), so PostgREST embeds the
// related row as an object rather than an array.
const OperatorVenueRowSchema = z.object({ venues: VenueSchema });

export type FetchOperatorVenuesResult =
  | { ok: true; venues: Venue[] }
  | { ok: false; error: 'rpc_failed' | 'invalid_response' };

export type ResolveOperatorVenuesResult =
  | { ok: true; operatorId: string; venues: Venue[] }
  | {
      ok: false;
      error: 'no_session' | 'not_provisioned' | 'rpc_failed' | 'invalid_response';
    };

let cachedOperator: Operator | null = null;
let cachedVenueIds: { operatorId: string; ids: string[] } | null = null;
let cachedVenues: { operatorId: string; venues: Venue[] } | null = null;

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

/**
 * The operator's venues with their display names, for the venue selector
 * (TAC-382).
 *
 * Distinct from `fetchOperatorVenueIds()` above, which exists to feed the
 * realtime channel's `venue_id=in.(...)` filter and needs nothing but ids.
 * This one carries `name`, and that is the point: it is the app's only source
 * of a real venue name. Deriving one from a slug loses whatever the slug
 * dropped — `le-mils-coffee` un-slugifies to "Le Mils Coffee", and the venue
 * is called "Le Mil's Coffee".
 *
 * Same v1 trust model as `fetchOperatorVenueIds`: a direct client read,
 * protected by the trusted-client assumption until RLS lands (TAC-271).
 */
export async function fetchOperatorVenues(
  operatorId: string,
): Promise<FetchOperatorVenuesResult> {
  if (cachedVenues && cachedVenues.operatorId === operatorId) {
    return { ok: true, venues: cachedVenues.venues };
  }

  const { data, error } = await supabase
    .from('operator_venues')
    .select('venues(id, name, slug, timezone)')
    .eq('operator_id', operatorId);
  if (error) return { ok: false, error: 'rpc_failed' };

  const parsed = z.array(OperatorVenueRowSchema).safeParse(data ?? []);
  if (!parsed.success) return { ok: false, error: 'invalid_response' };

  const venues = parsed.data.map((row) => row.venues);
  cachedVenues = { operatorId, venues };
  return { ok: true, venues };
}

/**
 * Everything the venue selector needs: who the operator is, and which venues
 * they can see. One call so the fixture-mode branch lives here at the data
 * boundary rather than in `lib/venue-context.tsx` — per the fixture-mode
 * convention, UI never reads `EXPO_PUBLIC_USE_FIXTURES` itself.
 *
 * Fixture mode skips Supabase entirely, including the operator lookup. It has
 * to: the point of fixture mode is offline dev, and resolving venues through a
 * network round-trip would fail exactly where fixtures are supposed to help.
 */
export async function resolveOperatorVenues(): Promise<ResolveOperatorVenuesResult> {
  if (isFixtureMode()) {
    return {
      ok: true,
      operatorId: FIXTURE_OPERATOR_ID,
      venues: [...FIXTURE_VENUES],
    };
  }

  const operatorResult = await getOperator();
  if (!operatorResult.ok) return { ok: false, error: operatorResult.error };

  const operatorId = operatorResult.operator.id;
  const venuesResult = await fetchOperatorVenues(operatorId);
  if (!venuesResult.ok) return { ok: false, error: venuesResult.error };

  return { ok: true, operatorId, venues: venuesResult.venues };
}

export function clearOperatorCache(): void {
  cachedOperator = null;
  cachedVenueIds = null;
  cachedVenues = null;
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
