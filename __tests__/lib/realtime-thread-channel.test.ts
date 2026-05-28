import { createThreadChannel } from '@/lib/realtime/thread-channel';
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

    // Matching guest → emitted.
    insert({
      new: {
        id: '22222222-2222-4222-8222-222222222222',
        venue_id: VENUE_ID,
        guest_id: GUEST_ID,
        direction: 'inbound',
        body: 'hello',
        created_at: '2026-05-14T16:00:00.000Z',
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

  it('drops rows with malformed direction (defensive)', () => {
    const handle = mockLiveChannel();
    const onInsert = jest.fn();
    createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert,
      onUpdate: jest.fn(),
    });
    const insert = handle.subscriptions.find((s) => s.event === 'INSERT')!.handler;

    insert({
      new: {
        id: '44444444-4444-4444-8444-444444444444',
        venue_id: VENUE_ID,
        guest_id: GUEST_ID,
        direction: 'sideways',
        body: 'malformed',
        created_at: '2026-05-14T16:02:00.000Z',
      },
    });
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the channel from the Supabase client', () => {
    mockLiveChannel();
    const channel = createThreadChannel({
      venueId: VENUE_ID,
      guestId: GUEST_ID,
      accessToken: 'tok',
      onInsert: jest.fn(),
      onUpdate: jest.fn(),
    });
    channel.unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
