// Same approach as queue-context.test.tsx: the real providers are mounted and
// only the network edge is stubbed, because the filtering is what is being
// claimed and the providers are what produce it.
//
// This one matters independently of the queue: the conversations screen
// computes `activeCount`, `totalCount` and the per-recognition-state counts
// over the context list rather than over its own filtered `rows`, so a
// provider that failed to filter would leave three aggregates quietly counting
// every venue.

import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';

import {
  ConversationsProvider,
  useConversationsContext,
} from '@/lib/conversations-context';
import { VenueProvider, useVenueSelection } from '@/lib/venue-context';
import { type ConversationSummary, listConversations } from '@/lib/api/conversations';
import { resolveOperatorVenues } from '@/lib/auth/operator';

jest.mock('@/hooks/use-conversations-realtime', () => ({
  useConversationsRealtime: jest.fn(),
}));
jest.mock('@/lib/api/conversations', () => ({ listConversations: jest.fn() }));
jest.mock('@/lib/auth/operator', () => ({
  resolveOperatorVenues: jest.fn(),
}));
jest.mock('@/lib/auth/use-session', () => ({
  useSession: () => ({ status: 'signed-in', session: { access_token: 't' } }),
}));

const listConversationsMock = listConversations as jest.MockedFunction<
  typeof listConversations
>;
const resolveOperatorVenuesMock = resolveOperatorVenues as jest.MockedFunction<
  typeof resolveOperatorVenues
>;

const OPERATOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const LE_MILS = {
  id: VENUE_A,
  name: "Le Mil's Coffee",
  slug: 'le-mils-coffee',
  timezone: 'America/Los_Angeles',
};
const CENTRAL_PERK = {
  id: VENUE_B,
  name: 'Mock Central Perk',
  slug: 'mock-central-perk',
  timezone: 'America/New_York',
};

function makeConversation(
  guestId: string,
  venueId: string,
  minsAgo: number,
): ConversationSummary {
  return {
    guestId,
    venueId,
    venueSlug: venueId === VENUE_A ? 'le-mils-coffee' : 'mock-central-perk',
    venueTimezone: 'America/Los_Angeles',
    agentName: 'Sana',
    name: null,
    phoneFallback: '+15550001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    recognitionState: 'regular',
    lastMessageAt: new Date(Date.now() - minsAgo * 60_000).toISOString(),
    lastMessageDirection: 'outbound',
    lastMessagePreview: 'hi',
    conversationCount: 1,
    firstConversationAt: new Date(Date.now() - 86_400_000).toISOString(),
  };
}

const A1 = makeConversation('a0000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d', VENUE_A, 5);
const B1 = makeConversation('b0000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d', VENUE_B, 10);
const A2 = makeConversation('a1000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d', VENUE_A, 15);

const handle: {
  guestIds: string[];
  status: string;
  select: (id: string) => void;
} = { guestIds: [], status: 'loading', select: () => {} };

function Probe() {
  const result = useConversationsContext();
  const venue = useVenueSelection();
  handle.guestIds = result.conversations.map((c) => c.guestId);
  handle.status = result.status;
  handle.select = venue.select;
  return <Text>{result.status}</Text>;
}

function mount() {
  return render(
    <VenueProvider>
      <ConversationsProvider>
        <Probe />
      </ConversationsProvider>
    </VenueProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  // The provider persists its resolved selection, so without this a venue
  // switched in one test is still selected at the next test's mount.
  await AsyncStorage.clear();
  resolveOperatorVenuesMock.mockResolvedValue({
    ok: true,
    operatorId: OPERATOR_ID,
    venues: [LE_MILS, CENTRAL_PERK],
  });
  listConversationsMock.mockResolvedValue({ ok: true, data: [A1, B1, A2] });
});

describe('ConversationsProvider venue filtering', () => {
  it('shows only the selected venue’s guests', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.guestIds).toEqual([A1.guestId, A2.guestId]);
    expect(handle.guestIds).not.toContain(B1.guestId);
  });

  it('swaps to the other venue’s guests on a switch', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    await act(async () => {
      handle.select(VENUE_B);
    });
    expect(handle.guestIds).toEqual([B1.guestId]);
  });

  it('reports loading, not an empty ready list, until the venue resolves', async () => {
    let resolveVenues: (v: never) => void = () => {};
    resolveOperatorVenuesMock.mockReturnValue(
      new Promise((r) => {
        resolveVenues = r as (v: never) => void;
      }),
    );
    mount();
    expect(handle.status).toBe('loading');
    expect(handle.guestIds).toEqual([]);
    await act(async () => {
      resolveVenues({
        ok: true,
        operatorId: OPERATOR_ID,
        venues: [LE_MILS],
      } as never);
    });
    await waitFor(() => expect(handle.status).toBe('ready'));
  });

  it('errors rather than falling back to unfiltered when venues fail to load', async () => {
    resolveOperatorVenuesMock.mockResolvedValue({ ok: false, error: 'rpc_failed' });
    mount();
    await waitFor(() => expect(handle.status).toBe('error'));
    expect(handle.guestIds).toEqual([]);
  });
});
