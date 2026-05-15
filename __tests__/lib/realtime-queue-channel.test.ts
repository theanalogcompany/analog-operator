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

type ChannelHandle = {
  channelName: string;
  subscriptions: { event: string; filter: string; handler: ChangeHandler }[];
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
        opts: { event: string; filter: string },
        handler: ChangeHandler,
      ) => ChannelLike;
      subscribe: (cb: (status: string) => void) => ChannelLike;
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
      subscribe: (cb) => {
        handle.fireStatus = cb;
        return ch;
      },
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

  it('sets the realtime auth token, opens INSERT + UPDATE on messages with the venue_id filter', () => {
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
    expect(handle.subscriptions.map((s) => s.event)).toEqual([
      'INSERT',
      'UPDATE',
    ]);
    for (const sub of handle.subscriptions) {
      expect(sub.filter).toBe(`venue_id=in.(${VENUE_A},${VENUE_B})`);
    }
  });

  it('emits queue_changed only on direction=outbound payloads', () => {
    const handle = mockLiveChannel();
    const onEvent = jest.fn();
    createQueueChannel({
      operatorId: OPERATOR_ID,
      venueIds: [VENUE_A],
      accessToken: 'tok',
      onEvent,
    });

    const insertHandler = handle.subscriptions[0].handler;

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
