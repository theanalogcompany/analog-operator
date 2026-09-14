// Venue filtering, exercised through the REAL providers.
//
// The claim these tests make is "a consumer of the queue context sees only the
// selected venue's drafts", and that behavior is produced by VenueProvider +
// QueueProvider + useQueue together. So all three are mounted for real and only
// the edges are stubbed: the network (`listQueue`), the realtime subscription,
// and the Supabase-backed operator lookup. Asserting this against a stubbed
// context would only prove the stub returns what the stub was given.
// (CLAUDE.md: "Never mock the layer whose behavior you are claiming.")

import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';

import { QueueProvider, useQueueContext } from '@/lib/queue-context';
import { VenueProvider, useVenueSelection } from '@/lib/venue-context';
import { type HeadsUpCommitment, type PendingDraft, listQueue } from '@/lib/api/queue';
import { resolveOperatorVenues } from '@/lib/auth/operator';

jest.mock('@/hooks/use-queue-realtime', () => ({ useQueueRealtime: jest.fn() }));
jest.mock('@/lib/api/queue', () => ({ listQueue: jest.fn() }));
jest.mock('@/lib/auth/operator', () => ({
  resolveOperatorVenues: jest.fn(),
}));
jest.mock('@/lib/auth/use-session', () => ({
  useSession: () => ({ status: 'signed-in', session: { access_token: 't' } }),
}));

const listQueueMock = listQueue as jest.MockedFunction<typeof listQueue>;
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

function makeDraft(over: Partial<PendingDraft> & { messageId: string }): PendingDraft {
  return {
    venueId: VENUE_A,
    venueSlug: 'le-mils-coffee',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: null,
    guestPhoneFallback: '+15550001',
    draftBody: 'x',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 1,
    recentContext: [],
    langfuseTraceId: null,
    ...over,
  };
}

const A1 = makeDraft({
  messageId: 'a1a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  venueId: VENUE_A,
  guestId: 'a0000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
});
const A2 = makeDraft({
  messageId: 'a2a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  venueId: VENUE_A,
  guestId: 'a1000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
});
const B1 = makeDraft({
  messageId: 'b1a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  venueId: VENUE_B,
  venueSlug: 'mock-central-perk',
  guestId: 'b0000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
});

// Reaches into the mounted providers so tests can drive a venue switch and an
// undo restore the way the app does.
const handle: {
  ids: string[];
  commitmentIds: string[];
  status: string;
  restore: (d: PendingDraft) => void;
  optimisticallyRemove: (messageId: string) => void;
  select: (id: string) => void;
  findVenueIdForGuest: (guestId: string) => string | null;
} = {
  ids: [],
  commitmentIds: [],
  status: 'loading',
  restore: () => {},
  optimisticallyRemove: () => {},
  select: () => {},
  findVenueIdForGuest: () => null,
};

function Probe() {
  const queue = useQueueContext();
  const venue = useVenueSelection();
  handle.ids = queue.drafts.map((d) => d.messageId);
  handle.commitmentIds = queue.commitments.map((c) => c.id);
  handle.status = queue.status;
  handle.restore = queue.restore;
  handle.optimisticallyRemove = queue.optimisticallyRemove;
  handle.select = venue.select;
  handle.findVenueIdForGuest = queue.findVenueIdForGuest;
  return <Text>{`${queue.status}:${handle.ids.join(',')}`}</Text>;
}

function mount() {
  return render(
    <VenueProvider>
      <QueueProvider>
        <Probe />
      </QueueProvider>
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
  listQueueMock.mockResolvedValue({ ok: true, data: { drafts: [A1, B1, A2], commitments: [] } });
});

describe('QueueProvider venue filtering', () => {
  it('shows only the selected venue’s drafts', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    // Le Mil's sorts before Mock Central Perk, so it is the resolved default.
    expect(handle.ids).toEqual([A1.messageId, A2.messageId]);
    expect(handle.ids).not.toContain(B1.messageId);
  });

  it('swaps to the other venue’s drafts on a switch — and never merges', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));

    await act(async () => {
      handle.select(VENUE_B);
    });

    expect(handle.ids).toEqual([B1.messageId]);
  });

  it('reports loading, not an empty ready queue, until the venue resolves', async () => {
    // 'ready' with no drafts renders "you're all caught up" — a confident
    // claim about a venue we have not identified yet.
    let resolveVenues: (v: never) => void = () => {};
    resolveOperatorVenuesMock.mockReturnValue(
      new Promise((r) => {
        resolveVenues = r as (v: never) => void;
      }),
    );

    mount();
    expect(handle.status).toBe('loading');
    expect(handle.ids).toEqual([]);

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
    // Failing open here would silently restore the merged view.
    resolveOperatorVenuesMock.mockResolvedValue({ ok: false, error: 'rpc_failed' });
    mount();
    await waitFor(() => expect(handle.status).toBe('error'));
    expect(handle.ids).toEqual([]);
  });

  it('finds a guest’s venue across venues, for the notification tap', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    // B1 is not visible, but its venue is still resolvable — that is what lets
    // a tapped push switch venues instead of silently doing nothing.
    expect(handle.findVenueIdForGuest(B1.guestId)).toBe(VENUE_B);
    expect(handle.findVenueIdForGuest('nobody')).toBeNull();
  });
});

describe('undo restores into the draft’s own venue (TAC-382, option 1)', () => {
  // These MUST remove the card first. `useQueue.restore` early-returns on a
  // messageId already in the list, so restoring a draft that was never cleared
  // is a no-op — and a test written that way passes whether the fix works, is
  // broken, or is deleted. That is the TAC-312 false-certificate shape, on the
  // highest-priority bug of this ticket.
  async function approveA1AtLeMils() {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.ids).toEqual([A1.messageId, A2.messageId]);

    // What a swipe-right does locally, before the API resolves.
    await act(async () => {
      handle.optimisticallyRemove(A1.messageId);
    });
    expect(handle.ids).toEqual([A2.messageId]);
  }

  it('does not inject a restored draft into the venue on screen', async () => {
    await approveA1AtLeMils();

    await act(async () => {
      handle.select(VENUE_B);
    });
    expect(handle.ids).toEqual([B1.messageId]);

    // Undo from Central Perk. The old behavior put A1 into whatever list was
    // on screen; this assertion fails if `restore` is filtered.
    await act(async () => {
      handle.restore(A1);
    });

    expect(handle.ids).toEqual([B1.messageId]);
    expect(handle.ids).not.toContain(A1.messageId);
  });

  it('puts the restored draft back in its own venue, waiting on return', async () => {
    await approveA1AtLeMils();

    await act(async () => {
      handle.select(VENUE_B);
    });
    await act(async () => {
      handle.restore(A1);
    });
    await act(async () => {
      handle.select(VENUE_A);
    });

    // Back at Le Mil's, with both cards — not lost, not moved to Central Perk.
    expect(handle.ids).toContain(A1.messageId);
    expect(handle.ids).toContain(A2.messageId);
  });

  it('still restores normally when no venue switch happened', async () => {
    // The ordinary undo, to prove the venue-aware path didn't break it.
    await approveA1AtLeMils();
    await act(async () => {
      handle.restore(A1);
    });
    expect(handle.ids).toContain(A1.messageId);
  });
});

describe('provider nesting', () => {
  it('refuses to mount QueueProvider outside VenueProvider', () => {
    // app/_layout.tsx must keep VenueProvider ABOVE QueueProvider. Reordering
    // them throws at boot — behind the splash, which is the expensive class of
    // crash to diagnose. This is the test that names the requirement.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <QueueProvider>
            <Probe />
          </QueueProvider>,
        ),
      ).toThrow('useVenueSelection must be used inside <VenueProvider>');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('heads-up cards follow the venue selection (TAC-364)', () => {
  const commitmentAt = (
    venueId: string,
    id: string,
    guestId: string,
  ): HeadsUpCommitment => ({
    id,
    venueId,
    guestId,
    type: 'comp',
    guest: { name: 'Sam' },
    description: 'A cortado on the house',
    code: '7K2P',
    expected_arrival: null,
    created_at: '2026-09-14T08:00:00.000Z',
    recognitionState: null,
    sourceMessageId: null,
  });
  const C_A = commitmentAt(
    VENUE_A,
    'c1a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    'c0000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  );
  const C_B = commitmentAt(
    VENUE_B,
    'c2a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    'c1000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  );

  beforeEach(() => {
    listQueueMock.mockResolvedValue({
      ok: true,
      data: { drafts: [A1, B1], commitments: [C_A, C_B] },
    });
  });

  it('shows only the selected venue’s heads-up cards', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.commitmentIds).toEqual([C_A.id]);
  });

  it('swaps heads-up cards on a venue switch, and never merges them', async () => {
    mount();
    await waitFor(() => expect(handle.commitmentIds).toEqual([C_A.id]));
    await act(async () => {
      handle.select(VENUE_B);
    });
    await waitFor(() => expect(handle.commitmentIds).toEqual([C_B.id]));
  });

  it('resolves an arrival push’s venue from a heads-up card', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.findVenueIdForGuest(C_B.guestId)).toBe(VENUE_B);
  });
});
