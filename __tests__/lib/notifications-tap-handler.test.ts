import * as Notifications from 'expo-notifications';

import {
  __resetTapStateForTests,
  captureInitialTap,
  consumePendingTap,
  parseTapPayload,
  setPendingTap,
  subscribeToTaps,
  wireTapResponseListener,
} from '@/lib/notifications/tap-handler';

const getLastNotificationResponseAsyncMock =
  Notifications.getLastNotificationResponseAsync as jest.Mock;
const addNotificationResponseReceivedListenerMock =
  Notifications.addNotificationResponseReceivedListener as jest.Mock;

const VALID_GUEST_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VALID_DRAFT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_COMMITMENT_ID = 'aabbccdd-1111-4222-8333-444455556666';

beforeEach(() => {
  __resetTapStateForTests();
  getLastNotificationResponseAsyncMock.mockReset();
  addNotificationResponseReceivedListenerMock.mockReset();
  addNotificationResponseReceivedListenerMock.mockReturnValue({ remove: jest.fn() });
});

describe('parseTapPayload', () => {
  it('returns { guestId, commitmentId: null } for a draft-style payload', () => {
    expect(
      parseTapPayload({
        guestId: VALID_GUEST_ID,
        draftId: VALID_DRAFT_ID,
        operatorId: VALID_GUEST_ID,
      }),
    ).toEqual({ guestId: VALID_GUEST_ID, commitmentId: null });
  });

  it('parses commitmentId when present (TAC-298 push payload)', () => {
    expect(
      parseTapPayload({
        guestId: VALID_GUEST_ID,
        commitmentId: VALID_COMMITMENT_ID,
        operatorId: VALID_GUEST_ID,
      }),
    ).toEqual({ guestId: VALID_GUEST_ID, commitmentId: VALID_COMMITMENT_ID });
  });

  it('accepts payload with only guestId (others optional)', () => {
    expect(parseTapPayload({ guestId: VALID_GUEST_ID })).toEqual({
      guestId: VALID_GUEST_ID,
      commitmentId: null,
    });
  });

  it('returns null for missing guestId', () => {
    expect(parseTapPayload({ draftId: VALID_DRAFT_ID })).toBeNull();
  });

  it('returns null for non-uuid guestId', () => {
    expect(parseTapPayload({ guestId: 'not-a-uuid' })).toBeNull();
  });

  it('returns null for non-uuid commitmentId (whole payload rejected — strict parse)', () => {
    expect(
      parseTapPayload({ guestId: VALID_GUEST_ID, commitmentId: 'not-a-uuid' }),
    ).toBeNull();
  });

  it('returns null for null / undefined / non-object payloads', () => {
    expect(parseTapPayload(null)).toBeNull();
    expect(parseTapPayload(undefined)).toBeNull();
    expect(parseTapPayload('string')).toBeNull();
    expect(parseTapPayload(42)).toBeNull();
  });
});

describe('pending-tap ref + subscribers', () => {
  const draftTap = { guestId: VALID_GUEST_ID, commitmentId: null };
  const commitmentTap = { guestId: VALID_GUEST_ID, commitmentId: VALID_COMMITMENT_ID };

  it('setPendingTap stores the value and notifies all subscribers', () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribeToTaps(a);
    subscribeToTaps(b);
    setPendingTap(draftTap);
    expect(a).toHaveBeenCalledWith(draftTap);
    expect(b).toHaveBeenCalledWith(draftTap);
  });

  it('consumePendingTap drains the ref', () => {
    setPendingTap(draftTap);
    expect(consumePendingTap()).toEqual(draftTap);
    expect(consumePendingTap()).toBeNull();
  });

  it('subscribeToTaps fires immediately when a tap is already pending', () => {
    setPendingTap(commitmentTap);
    const fn = jest.fn();
    subscribeToTaps(fn);
    expect(fn).toHaveBeenCalledWith(commitmentTap);
  });

  it('subscribeToTaps does NOT drain the ref on subscribe', () => {
    setPendingTap(draftTap);
    subscribeToTaps(jest.fn());
    expect(consumePendingTap()).toEqual(draftTap);
  });

  it('unsubscribe stops future notifications', () => {
    const fn = jest.fn();
    const unsub = subscribeToTaps(fn);
    unsub();
    setPendingTap(draftTap);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('captureInitialTap', () => {
  it('sets pendingTap from a valid cold-launch response', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce({
      notification: { request: { content: { data: { guestId: VALID_GUEST_ID } } } },
    });
    await captureInitialTap();
    expect(consumePendingTap()).toEqual({
      guestId: VALID_GUEST_ID,
      commitmentId: null,
    });
  });

  it('preserves commitmentId on cold-launch when present', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce({
      notification: {
        request: {
          content: {
            data: { guestId: VALID_GUEST_ID, commitmentId: VALID_COMMITMENT_ID },
          },
        },
      },
    });
    await captureInitialTap();
    expect(consumePendingTap()).toEqual({
      guestId: VALID_GUEST_ID,
      commitmentId: VALID_COMMITMENT_ID,
    });
  });

  it('no-ops when getLastNotificationResponseAsync returns null', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce(null);
    await captureInitialTap();
    expect(consumePendingTap()).toBeNull();
  });

  it('no-ops on malformed payload', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce({
      notification: { request: { content: { data: { not: 'a-tap' } } } },
    });
    await captureInitialTap();
    expect(consumePendingTap()).toBeNull();
  });

  it('no-ops on throw', async () => {
    getLastNotificationResponseAsyncMock.mockRejectedValueOnce(new Error('boom'));
    await captureInitialTap();
    expect(consumePendingTap()).toBeNull();
  });
});

describe('wireTapResponseListener', () => {
  it('sets pendingTap when warm-launch tap fires', () => {
    let captured: ((r: unknown) => void) | null = null;
    addNotificationResponseReceivedListenerMock.mockImplementation((cb) => {
      captured = cb;
      return { remove: jest.fn() };
    });
    wireTapResponseListener();
    expect(captured).not.toBeNull();
    captured!({
      notification: { request: { content: { data: { guestId: VALID_GUEST_ID } } } },
    });
    expect(consumePendingTap()).toEqual({
      guestId: VALID_GUEST_ID,
      commitmentId: null,
    });
  });

  it('teardown removes the listener', () => {
    const remove = jest.fn();
    addNotificationResponseReceivedListenerMock.mockReturnValueOnce({ remove });
    const stop = wireTapResponseListener();
    stop();
    expect(remove).toHaveBeenCalled();
  });
});
