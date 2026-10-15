// Venue-level state and the Instagram connect call (TAC-517, client half of
// TAC-516). Every shape here is transcribed from TAC-516's `## Contract`:
//
//   GET  /api/operator/venues/[venueId]
//     → { "instagram": { "status": "connected", "username": "lemilscoffee",
//                        "expiresAt": "2026-11-21T00:00:00.000Z" } }
//   POST /api/operator/venues/[venueId]/instagram/connect
//     → { "authorizationUrl": "https://www.instagram.com/oauth/authorize?...",
//         "expiresAt": "2026-09-22T23:10:00.000Z" }
//
// The app never sees or stores a token. It reads a status and opens a URL.

import { z } from 'zod';

import { fixtureConnectUrl, fixtureVenueInstagram } from '@/lib/fixtures/venues';

import { authedFetch, parseHttpError } from './client';
import { type ApiError, type Result, err, ok } from './errors';
import { isFixtureMode } from './queue';

export const InstagramConnectionStatusSchema = z.enum([
  'connected',
  'disconnected',
  'expiring',
]);
export type InstagramConnectionStatus = z.infer<typeof InstagramConnectionStatusSchema>;

// Field by field with `.catch`, so an unreadable handle or date costs that
// field and not the screen (the TAC-474 lesson). `status` is the exception: a
// block whose status can't be read says nothing about the connection, so the
// whole block becomes null, which the screen renders as "Couldn't check" and
// never as "Not connected" (lib/instagram-connection.ts).
const InstagramConnectionSchema = z.object({
  status: InstagramConnectionStatusSchema,
  username: z.string().nullable().catch(null),
  expiresAt: z.string().nullable().catch(null),
});
export type InstagramConnection = z.infer<typeof InstagramConnectionSchema>;

// Not `.strict()`: the Contract leaves room for the payload to grow.
const VenueStateSchema = z.object({
  instagram: InstagramConnectionSchema.nullable().catch(null),
});
export type VenueState = z.infer<typeof VenueStateSchema>;

// `authorizationUrl` is the one URL the app opens that the server built, so it
// must be https. `expiresAt` is read by nothing here, so a malformed one must
// not cost the operator a connect whose URL was fine.
const ConnectResponseSchema = z.object({
  authorizationUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), 'authorizationUrl must be https'),
  expiresAt: z.string().nullable().catch(null),
});
export type InstagramConnectStart = z.infer<typeof ConnectResponseSchema>;

function parseFailure(reason: string): { ok: false; error: ApiError } {
  return err<ApiError>({ kind: 'PARSE', message: reason });
}

async function readJson(response: Response): Promise<Result<unknown>> {
  try {
    return ok(await response.json());
  } catch {
    return parseFailure('response body is not JSON');
  }
}

/**
 * The venue's state. Uncached on purpose: the screen refetches on every
 * return to the foreground, which is how a connect finished in the browser
 * shows up, so this must not ride `fetchOperatorVenues`' session cache.
 */
export async function getVenueState(venueId: string): Promise<Result<VenueState>> {
  if (isFixtureMode()) {
    return ok({ instagram: fixtureVenueInstagram(venueId) });
  }
  const result = await authedFetch(`/api/operator/venues/${encodeURIComponent(venueId)}`, {
    method: 'GET',
  });
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  const json = await readJson(result.data);
  if (!json.ok) return json;
  const parsed = VenueStateSchema.safeParse(json.data);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data);
}

/** Ask the server for Instagram's approval URL for this venue. */
export async function startInstagramConnect(
  venueId: string,
): Promise<Result<InstagramConnectStart>> {
  if (isFixtureMode()) {
    return ok({
      authorizationUrl: fixtureConnectUrl(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  }
  const result = await authedFetch(
    `/api/operator/venues/${encodeURIComponent(venueId)}/instagram/connect`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  const json = await readJson(result.data);
  if (!json.ok) return json;
  const parsed = ConnectResponseSchema.safeParse(json.data);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data);
}
