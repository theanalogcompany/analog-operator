import { createQueueChannel } from '@/lib/realtime/queue-channel';
import { supabase } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
    realtime: { setAuth: jest.fn() },
  },
}));

jest.mock('@/lib/fixtures/queue', () => {
  const subscribeQueueFixture = jest.fn(() => () => undefined);
  return { subscribeQueueFixture };
});

import { subscribeQueueFixture } from '@/lib/fixtures/queue';

const channelFactory = supabase.channel as jest.Mock;
const removeChannel = supabase.removeChannel as jest.Mock;
const setAuth = supabase.realtime.setAuth as jest.Mock;
const fixtureSubscribe = subscribeQueueFixture as jest.Mock;

const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;

const OPERATOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type ChangeHandler = (payload: {
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) => void;

type Subscription = {
  event: string;
  table: string;
  filter: string;
  handler: ChangeHandler;
};

type ChannelHandle = {
  channelName: string;
  subscriptions: Subscription[];
  fireStatus: (status: string) => void;
};

function mockLiveChannel(): ChannelHandle {
  const handle: ChannelHandle = {
    channelName: '',
    subscriptions: [],
    fireStatus: () => undefined,
  };
  channelFactory.mockImplementation((name: string) => {
    handle.channelName = name;
    type ChannelLike = {
      on: (
        kind: string,
        opts: { event: string; table: string; filter: string },
        handler: ChangeHandler,
      ) => ChannelLike;
      subscribe: (cb: (status: string) => void) => ChannelLike;
    };
    const ch: ChannelLike = {
      on: (_kind, opts, handler) => {
        handle.subscriptions.push({
          event: opts.event,
          table: opts.table,
          filter: opts.filter,
          handler,
        });
        return ch;
      },
      subscribe: (cb) => {
        handle.fireStatus = cb;
        return ch;
      },
    };
    return ch;
  });
  return handle;
}

function messagesHandlers(handle: ChannelHandle): ChangeHandler[] {
  return handle.subscriptions
    .filter((s) => s.table === 'messages')
    .map((s) => s.handler);
}

function commitmentsHandlers(handle: ChannelHandle): ChangeHandler[] {
  return handle.subscriptions
    .filter((s) => s.table === 'guest_commitments')
    .map((s) => s.handler);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
});

afterAll(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
});

describe('createQueueChannel — fixture mode', () => {
  it('delegates to subscribeQueueFixture and never opens a Supabase channel', () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    const onEvent = jest.fn();
    const channel = createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [VENUE_A],
      accessToken: 'tok',
      onEvent,
    });
    expect(fixtureSubscribe).toHaveBeenCalledWith(onEvent);
    expect(channelFactory).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
    channel.unsubscribe();
  });
});

describe('createQueueChannel — live mode', () => {
  it('returns a no-op channel when the operator has no venue allowlist', () => {
    const onEvent = jest.fn();
    const channel = createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [],
      accessToken: 'tok',
      onEvent,
    });
    expect(channelFactory).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
    // Should be safe to call unsubscribe regardless.
    channel.unsubscribe();
  });

  it('sets the realtime auth token, opens INSERT + UPDATE on both messages + guest_commitments with the venue_id filter', () => {
    const handle = mockLiveChannel();
    const onEvent = jest.fn();
    createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [VENUE_A, VENUE_B],
      accessToken: 'tok',
      onEvent,
    });

    expect(setAuth).toHaveBeenCalledWith('tok');
    expect(handle.channelName).toBe(`operator-queue-${OPERATOR_ID}`);
    // TAC-298 adds parallel guest_commitments subscriptions alongside the
    // existing messages ones — both tables, both INSERT + UPDATE, same
    // venue_id filter.
    expect(handle.subscriptions.map((s) => ({ event: s.event, table: s.table }))).toEqual([
      { event: 'INSERT', table: 'messages' },
      { event: 'UPDATE', table: 'messages' },
      { event: 'INSERT', table: 'guest_commitments' },
      { event: 'UPDATE', table: 'guest_commitments' },
    ]);
    for (const sub of handle.subscriptions) {
      expect(sub.filter).toBe(`venue_id=in.(${VENUE_A},${VENUE_B})`);
    }
  });

  it('messages handler emits queue_changed only on direction=outbound payloads', () => {
    const handle = mockLiveChannel();
    const onEvent = jest.fn();
    createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [VENUE_A],
      accessToken: 'tok',
      onEvent,
    });

    const [insertHandler] = messagesHandlers(handle);

    insertHandler({ new: { direction: 'inbound' } });
    expect(onEvent).not.toHaveBeenCalled();

    insertHandler({ new: { direction: 'outbound' } });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: 'queue_changed' });

    // payload-direction also derived from `old` when the row was deleted /
    // soft-removed (REPLICA IDENTITY FULL means old is populated)
    onEvent.mockClear();
    insertHandler({ new: null, old: { direction: 'outbound' } });
    expect(onEvent).toHaveBeenCalledWith({ type: 'queue_changed' });
  });

  it('commitments handler emits queue_changed on any payload (no direction filter)', () => {
    // guest_commitments doesn't have `direction`; status-transition rows
    // (open/pending_ack/acknowledged/cancelled) are all interesting to the
    // queue because the endpoint shows only `pending_ack` — any change
    // could add or remove a card. (TAC-298.)
    const handle = mockLiveChannel();
    const onEvent = jest.fn();
    createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [VENUE_A],
      accessToken: 'tok',
      onEvent,
    });

    const [insertHandler, updateHandler] = commitmentsHandlers(handle);

    insertHandler({ new: { status: 'pending_ack' } });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: 'queue_changed' });

    onEvent.mockClear();
    updateHandler({ new: { status: 'acknowledged' }, old: { status: 'pending_ack' } });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: 'queue_changed' });
  });

  it('fires onReconnect when the channel transitions back to SUBSCRIBED after a CHANNEL_ERROR', () => {
    const handle = mockLiveChannel();
    const onEvent = jest.fn();
    const onReconnect = jest.fn();
    createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [VENUE_A],
      accessToken: 'tok',
      onEvent,
      onReconnect,
    });

    // First SUBSCRIBED is the initial subscribe — not a reconnect.
    handle.fireStatus('SUBSCRIBED');
    expect(onReconnect).not.toHaveBeenCalled();

    // Drop and recover.
    handle.fireStatus('CHANNEL_ERROR');
    handle.fireStatus('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(1);

    // TIMED_OUT → SUBSCRIBED also counts.
    handle.fireStatus('TIMED_OUT');
    handle.fireStatus('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(2);

    // Steady-state SUBSCRIBED → SUBSCRIBED does not.
    handle.fireStatus('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe removes the channel from the Supabase client', () => {
    mockLiveChannel();
    const onEvent = jest.fn();
    const channel = createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [VENUE_A],
      accessToken: 'tok',
      onEvent,
    });
    channel.unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
