import { countsAsThreadRow, createThreadChannel } from '@/lib/realtime/thread-channel';
import { supabase } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
    realtime: { setAuth: jest.fn() },
  },
}));

jest.mock('@/lib/fixtures/queue', () => {
  const subscribeThreadFixture = jest.fn(() => () => undefined);
  return { subscribeThreadFixture };
});

import { subscribeThreadFixture } from '@/lib/fixtures/queue';

const channelFactory = supabase.channel as jest.Mock;
const removeChannel = supabase.removeChannel as jest.Mock;
const setAuth = supabase.realtime.setAuth as jest.Mock;
const fixtureSubscribe = subscribeThreadFixture as jest.Mock;

const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;

const VENUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUEST_ID = 'bb22e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e';
const OTHER_GUEST_ID = 'cc33f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a';

type ChangeHandler = (payload: {
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) => void;

type ChannelHandle = {
  channelName: string;
  subscriptions: { event: string; filter: string; handler: ChangeHandler }[];
};

function mockLiveChannel(): ChannelHandle {
  const handle: ChannelHandle = { channelName: '', subscriptions: [] };
  channelFactory.mockImplementation((name: string) => {
    handle.channelName = name;
    type ChannelLike = {
      on: (
        kind: string,
        opts: { event: string; filter: string },
        handler: ChangeHandler,
      ) => ChannelLike;
      subscribe: () => ChannelLike;
    };
    const ch: ChannelLike = {
      on: (_kind, opts, handler) => {
        handle.subscriptions.push({
          event: opts.event,
          filter: opts.filter,
          handler,
        });
        return ch;
      },
      subscribe: () => ch,
    };
    return ch;
  });
  return handle;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
});

afterAll(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
});

describe('createThreadChannel — fixture mode', () => {
  it('delegates to subscribeThreadFixture and never opens a Supabase channel', () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    const channel = createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert: jest.fn(),
      onUpdate: jest.fn(),
      onRemove: jest.fn(),
    });
    expect(fixtureSubscribe).toHaveBeenCalledTimes(1);
    expect(channelFactory).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
    channel.unsubscribe();
  });
});

describe('createThreadChannel — live mode', () => {
  it('sets the realtime auth token, opens INSERT + UPDATE on messages with the venue_id filter', () => {
    const handle = mockLiveChannel();
    createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert: jest.fn(),
      onUpdate: jest.fn(),
      onRemove: jest.fn(),
    });

    expect(setAuth).toHaveBeenCalledWith('tok');
    expect(handle.channelName).toBe(`thread:${VENUE_ID}:${GUEST_ID}`);
    expect(handle.subscriptions.map((s) => s.event)).toEqual(['INSERT', 'UPDATE']);
    for (const sub of handle.subscriptions) {
      expect(sub.filter).toBe(`venue_id=eq.${VENUE_ID}`);
    }
  });

  it('fires onInsert only when the row matches the open guest_id (post-filter)', () => {
    const handle = mockLiveChannel();
    const onInsert = jest.fn();
    createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert,
      onUpdate: jest.fn(),
      onRemove: jest.fn(),
    });
    const insert = handle.subscriptions.find((s) => s.event === 'INSERT')!.handler;

    // Different guest at same venue → skipped.
    insert({
      new: {
        id: '11111111-1111-4111-8111-111111111111',
        venue_id: VENUE_ID,
        guest_id: OTHER_GUEST_ID,
        direction: 'inbound',
        body: 'not us',
        created_at: '2026-05-14T16:00:00.000Z',
      },
    });
    expect(onInsert).not.toHaveBeenCalled();

    // Matching guest → emitted. NULL `review_state` and `status: 'received'`
    // are what a real inbound row carries; inbound is decided by `direction`
    // alone (TAC-395 Contract), which is why a status outside the delivered
    // set does not stop it.
    insert({
      new: {
        id: '22222222-2222-4222-8222-222222222222',
        venue_id: VENUE_ID,
        guest_id: GUEST_ID,
        direction: 'inbound',
        body: 'hello',
        created_at: '2026-05-14T16:00:00.000Z',
        status: 'received',
        review_state: null,
      },
    });
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith({
      id: '22222222-2222-4222-8222-222222222222',
      direction: 'inbound',
      body: 'hello',
      createdAt: '2026-05-14T16:00:00.000Z',
    });
  });

  it('fires onUpdate when an UPDATE payload arrives for the open guest', () => {
    const handle = mockLiveChannel();
    const onUpdate = jest.fn();
    createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert: jest.fn(),
      onUpdate,
      onRemove: jest.fn(),
    });
    const update = handle.subscriptions.find((s) => s.event === 'UPDATE')!.handler;

    update({
      new: {
        id: '33333333-3333-4333-8333-333333333333',
        venue_id: VENUE_ID,
        guest_id: GUEST_ID,
        direction: 'outbound',
        body: 'updated body',
        created_at: '2026-05-14T16:01:00.000Z',
        // An outbound row needs a delivered status to count (TAC-395
        // Contract, "Which messages count"). Before TAC-411 this payload
        // carried none and was emitted anyway.
        status: 'sent',
        review_state: null,
      },
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      id: '33333333-3333-4333-8333-333333333333',
      direction: 'outbound',
      body: 'updated body',
      createdAt: '2026-05-14T16:01:00.000Z',
    });
  });

  it('removes rows with malformed direction rather than dropping them silently', () => {
    const handle = mockLiveChannel();
    const onInsert = jest.fn();
    const onRemove = jest.fn();
    createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert,
      onUpdate: jest.fn(),
      onRemove,
    });
    const insert = handle.subscriptions.find((s) => s.event === 'INSERT')!.handler;

    // `status: 'sent'` clears the Contract's condition, so this row reaches
    // `rowToMessage` and fails there instead. It still cannot be a bubble, so
    // it leaves the thread rather than being dropped before the decision.
    insert({
      new: {
        id: '44444444-4444-4444-8444-444444444444',
        venue_id: VENUE_ID,
        guest_id: GUEST_ID,
        direction: 'sideways',
        body: 'malformed',
        created_at: '2026-05-14T16:02:00.000Z',
        status: 'sent',
        review_state: null,
      },
    });
    expect(onInsert).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444');
  });

  it('unsubscribe removes the channel from the Supabase client', () => {
    mockLiveChannel();
    const channel = createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert: jest.fn(),
      onUpdate: jest.fn(),
      onRemove: jest.fn(),
    });
    channel.unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TAC-411 — the app filters live thread rows, because the server does not.
//
// Every case below is transcribed from TAC-395's `## Contract`, section
// "Which messages count", NOT from the implementation:
//
//   A row counts when both hold:
//     1. body <> ''
//     2. direction = 'inbound'
//          OR (review_state IS DISTINCT FROM 'pending'
//              AND status IN ('sending', 'sent', 'delivered'))
//
// and section "Realtime", step 3: a row that does not count "removes any
// entry with that id and adds nothing."
// ---------------------------------------------------------------------------

describe('countsAsThreadRow — TAC-395 Contract, "Which messages count"', () => {
  it('keeps an inbound row with NULL review_state', () => {
    expect(
      countsAsThreadRow({
        direction: 'inbound',
        body: 'the cortado i got this morning was cold and bad',
        status: 'received',
        review_state: null,
      }),
    ).toBe(true);
  });

  it('keeps an inbound row whatever its review_state', () => {
    // "Inbound is decided by `direction` alone." A condition applied to all
    // rows, such as .neq('review_state','pending'), drops every inbound row.
    expect(
      countsAsThreadRow({
        direction: 'inbound',
        body: 'omw now!',
        status: 'pending_review',
        review_state: 'pending',
      }),
    ).toBe(true);
  });

  it('drops a row with an empty body, in either direction', () => {
    expect(
      countsAsThreadRow({ direction: 'inbound', body: '', status: 'delivered' }),
    ).toBe(false);
    expect(
      countsAsThreadRow({ direction: 'outbound', body: '', status: 'sent' }),
    ).toBe(false);
  });

  it('drops a pending draft', () => {
    expect(
      countsAsThreadRow({
        direction: 'outbound',
        body: "you're talking to one 😊 Himanshu, one of the owners. what's up?",
        status: 'pending_review',
        review_state: 'pending',
      }),
    ).toBe(false);
  });

  it('drops a skipped draft', () => {
    expect(
      countsAsThreadRow({
        direction: 'outbound',
        body: 'a draft the operator skipped',
        status: 'pending_review',
        review_state: 'skipped',
      }),
    ).toBe(false);
  });

  it('keeps an outbound row at each of sending, sent and delivered', () => {
    // `sending` counts: Sendblue's callbacks arrive out of order and can leave
    // a message the guest did receive at `sending`.
    for (const status of ['sending', 'sent', 'delivered']) {
      expect(
        countsAsThreadRow({
          direction: 'outbound',
          body: '8:15 is yours. Same table.',
          status,
          review_state: null,
        }),
      ).toBe(true);
    }
  });

  it('drops an outbound row that failed', () => {
    expect(
      countsAsThreadRow({
        direction: 'outbound',
        body: '8:15 is yours. Same table.',
        status: 'failed',
        review_state: null,
      }),
    ).toBe(false);
  });

  it('drops an approved reply whose send never happened', () => {
    // review_state clears, but the status never reached the wire: the claim
    // UPDATE flips `review_state` and only stamps `status: 'sent'` once
    // Sendblue returns, so a send that never happened leaves the row at
    // 'pending_review'. Two such rows in production since March (21:44
    // ruling). `status` cannot be 'pending' on any row — the messages
    // CHECK constraint excludes it; see the schema comment in
    // lib/realtime/thread-channel.ts.
    expect(
      countsAsThreadRow({
        direction: 'outbound',
        body: 'an approved reply that never sent',
        status: 'pending_review',
        review_state: 'approved',
      }),
    ).toBe(false);
  });

  it('drops an outbound row whose status cannot be read', () => {
    // Fails toward removal, not toward display. See the schema comment.
    expect(
      countsAsThreadRow({ direction: 'outbound', body: 'no status field' }),
    ).toBe(false);
  });
});

describe('createThreadChannel — live rows are filtered and removed (TAC-411)', () => {
  function openChannel() {
    const handle = mockLiveChannel();
    const onInsert = jest.fn();
    const onUpdate = jest.fn();
    const onRemove = jest.fn();
    createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert,
      onUpdate,
      onRemove,
    });
    return {
      onInsert,
      onUpdate,
      onRemove,
      insert: handle.subscriptions.find((s) => s.event === 'INSERT')!.handler,
      update: handle.subscriptions.find((s) => s.event === 'UPDATE')!.handler,
    };
  }

  const PENDING_ID = '55555555-5555-4555-8555-555555555555';

  function row(overrides: Record<string, unknown>) {
    return {
      id: PENDING_ID,
      venue_id: VENUE_ID,
      guest_id: GUEST_ID,
      direction: 'outbound',
      body: 'Done — got you down for two at 7:30.',
      created_at: '2026-09-15T17:00:04.000Z',
      status: 'sent',
      review_state: null,
      ...overrides,
    };
  }

  it('never adds a pending draft, whether it arrives by INSERT or UPDATE', () => {
    // The reported defect: the guest texts again, the agent regenerates the
    // draft in place, and the UPDATE put it in the thread looking sent.
    const a = openChannel();
    a.insert({ new: row({ status: 'pending_review', review_state: 'pending' }) });
    expect(a.onInsert).not.toHaveBeenCalled();
    expect(a.onRemove).toHaveBeenCalledWith(PENDING_ID);

    const b = openChannel();
    b.update({ new: row({ status: 'pending_review', review_state: 'pending' }) });
    expect(b.onUpdate).not.toHaveBeenCalled();
    expect(b.onRemove).toHaveBeenCalledWith(PENDING_ID);
  });

  it('never adds a skipped draft', () => {
    const { insert, onInsert, onRemove } = openChannel();
    insert({ new: row({ status: 'pending_review', review_state: 'skipped' }) });
    expect(onInsert).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith(PENDING_ID);
  });

  it('never adds a row with an empty body', () => {
    const { insert, onInsert, onRemove } = openChannel();
    insert({ new: row({ body: '' }) });
    expect(onInsert).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith(PENDING_ID);
  });

  it('adds an outbound row at each of sending, sent and delivered', () => {
    for (const status of ['sending', 'sent', 'delivered']) {
      const { insert, onInsert, onRemove } = openChannel();
      insert({ new: row({ status }) });
      expect(onRemove).not.toHaveBeenCalled();
      expect(onInsert).toHaveBeenCalledWith({
        id: PENDING_ID,
        direction: 'outbound',
        body: 'Done — got you down for two at 7:30.',
        createdAt: '2026-09-15T17:00:04.000Z',
      });
    }
  });

  it('removes a row already in the thread that arrives as failed', () => {
    // "A sent message that a late Sendblue ERROR moves to `failed` leaves the
    // thread." (Contract, Realtime.)
    const { update, onUpdate, onRemove } = openChannel();
    update({ new: row({ status: 'failed' }) });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith(PENDING_ID);
  });

  it('does not remove for a row belonging to a different guest', () => {
    // The guest post-filter runs first: another guest's pending draft must not
    // reach into this thread and remove an id from it.
    const { insert, onInsert, onRemove } = openChannel();
    insert({
      new: row({
        guest_id: OTHER_GUEST_ID,
        status: 'pending_review',
        review_state: 'pending',
      }),
    });
    expect(onInsert).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });
});
