// The venues the fixture data belongs to.
//
// Single source of fixture venue identity: `lib/fixtures/queue.ts` and
// `lib/fixtures/conversations.ts` both stamp rows with these ids, and
// `lib/auth/operator.ts` hands this same list to the venue selector in fixture
// mode. They have to agree — a selector offering real venue UUIDs while the
// drafts carry mock ones filters every list down to nothing, which is exactly
// what "offline dev works" is supposed to prevent.

export const FIXTURE_SEXTANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const FIXTURE_CENTRAL_PERK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export const FIXTURE_VENUES = [
  {
    id: FIXTURE_SEXTANT_ID,
    name: 'Mock Sextant Coffee Roasters',
    slug: 'mock-sextant-coffee-roasters',
    timezone: 'America/Los_Angeles',
  },
  {
    id: FIXTURE_CENTRAL_PERK_ID,
    name: 'Mock Central Perk',
    slug: 'mock-central-perk',
    timezone: 'America/New_York',
  },
] as const;

/** A stable stand-in operator id, so fixture mode needs no Supabase row. */
export const FIXTURE_OPERATOR_ID = 'f1c7d0e2-3a4b-4c5d-8e6f-0a1b2c3d4e5f';

// Each fixture venue's Instagram connection (TAC-517), so the You screen's
// Instagram row renders offline. One connected, one expiring; an id that isn't
// a fixture venue reads as disconnected. Dates are relative to now so the
// expiring venue stays expiring.
export function fixtureVenueInstagram(venueId: string): {
  status: 'connected' | 'disconnected' | 'expiring';
  username: string | null;
  expiresAt: string | null;
} {
  const day = 24 * 60 * 60_000;
  if (venueId === FIXTURE_SEXTANT_ID) {
    return {
      status: 'connected',
      username: 'mocksextant',
      expiresAt: new Date(Date.now() + 40 * day).toISOString(),
    };
  }
  if (venueId === FIXTURE_CENTRAL_PERK_ID) {
    return {
      status: 'expiring',
      username: 'mockcentralperk',
      expiresAt: new Date(Date.now() + 3 * day + 60_000).toISOString(),
    };
  }
  return { status: 'disconnected', username: null, expiresAt: null };
}

/** Where fixture mode's Connect goes. A real page, so the browser opens. */
export function fixtureConnectUrl(): string {
  return 'https://www.instagram.com/';
}
