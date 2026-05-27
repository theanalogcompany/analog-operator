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

beforeEach(() => {
  __resetTapStateForTests();
  getLastNotificationResponseAsyncMock.mockReset();
  addNotificationResponseReceivedListenerMock.mockReset();
  addNotificationResponseReceivedListenerMock.mockReturnValue({ remove: jest.fn() });
});

describe('parseTapPayload', () => {
  it('returns guestId for a valid payload', () => {
    expect(
      parseTapPayload({
        guestId: VALID_GUEST_ID,
        draftId: VALID_DRAFT_ID,
        operatorId: VALID_GUEST_ID,
      }),
    ).toBe(VALID_GUEST_ID);
  });

  it('accepts payload with only guestId (draftId + operatorId optional)', () => {
    expect(parseTapPayload({ guestId: VALID_GUEST_ID })).toBe(VALID_GUEST_ID);
  });

  it('returns null for missing guestId', () => {
    expect(parseTapPayload({ draftId: VALID_DRAFT_ID })).toBeNull();
  });

  it('returns null for non-uuid guestId', () => {
    expect(parseTapPayload({ guestId: 'not-a-uuid' })).toBeNull();
  });

  it('returns null for null / undefined / non-object payloads', () => {
    expect(parseTapPayload(null)).toBeNull();
    expect(parseTapPayload(undefined)).toBeNull();
    expect(parseTapPayload('string')).toBeNull();
    expect(parseTapPayload(42)).toBeNull();
  });
});

describe('pending-tap ref + subscribers', () => {
  it('setPendingTap stores the value and notifies all subscribers', () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribeToTaps(a);
    subscribeToTaps(b);
    setPendingTap(VALID_GUEST_ID);
    expect(a).toHaveBeenCalledWith(VALID_GUEST_ID);
    expect(b).toHaveBeenCalledWith(VALID_GUEST_ID);
  });

  it('consumePendingTap drains the ref', () => {
    setPendingTap(VALID_GUEST_ID);
    expect(consumePendingTap()).toBe(VALID_GUEST_ID);
    expect(consumePendingTap()).toBeNull();
  });

  it('subscribeToTaps fires immediately when a tap is already pending', () => {
    setPendingTap(VALID_GUEST_ID);
    const fn = jest.fn();
    subscribeToTaps(fn);
    expect(fn).toHaveBeenCalledWith(VALID_GUEST_ID);
  });

  it('subscribeToTaps does NOT drain the ref on subscribe', () => {
    setPendingTap(VALID_GUEST_ID);
    subscribeToTaps(jest.fn());
    expect(consumePendingTap()).toBe(VALID_GUEST_ID);
  });

  it('unsubscribe stops future notifications', () => {
    const fn = jest.fn();
    const unsub = subscribeToTaps(fn);
    unsub();
    setPendingTap(VALID_GUEST_ID);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('captureInitialTap', () => {
  it('sets pendingGuestId from a valid cold-launch response', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce({
      notification: { request: { content: { data: { guestId: VALID_GUEST_ID } } } },
    });
    await captureInitialTap();
    expect(consumePendingTap()).toBe(VALID_GUEST_ID);
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
  it('sets pendingGuestId when warm-launch tap fires', () => {
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
    expect(consumePendingTap()).toBe(VALID_GUEST_ID);
  });

  it('teardown removes the listener', () => {
    const remove = jest.fn();
    addNotificationResponseReceivedListenerMock.mockReturnValueOnce({ remove });
    const stop = wireTapResponseListener();
    stop();
    expect(remove).toHaveBeenCalled();
  });
});
