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
const DRAFT_TAP = { kind: 'draft', guestId: VALID_GUEST_ID } as const;

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
    ).toEqual(DRAFT_TAP);
  });

  it('accepts payload with only guestId (draftId + operatorId optional)', () => {
    expect(parseTapPayload({ guestId: VALID_GUEST_ID })).toEqual(DRAFT_TAP);
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
    setPendingTap(DRAFT_TAP);
    expect(a).toHaveBeenCalledWith(DRAFT_TAP);
    expect(b).toHaveBeenCalledWith(DRAFT_TAP);
  });

  it('consumePendingTap drains the ref', () => {
    setPendingTap(DRAFT_TAP);
    expect(consumePendingTap()).toEqual(DRAFT_TAP);
    expect(consumePendingTap()).toBeNull();
  });

  it('subscribeToTaps fires immediately when a tap is already pending', () => {
    setPendingTap(DRAFT_TAP);
    const fn = jest.fn();
    subscribeToTaps(fn);
    expect(fn).toHaveBeenCalledWith(DRAFT_TAP);
  });

  it('subscribeToTaps does NOT drain the ref on subscribe', () => {
    setPendingTap(DRAFT_TAP);
    subscribeToTaps(jest.fn());
    expect(consumePendingTap()).toEqual(DRAFT_TAP);
  });

  it('unsubscribe stops future notifications', () => {
    const fn = jest.fn();
    const unsub = subscribeToTaps(fn);
    unsub();
    setPendingTap(DRAFT_TAP);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('captureInitialTap', () => {
  it('sets pendingGuestId from a valid cold-launch response', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce({
      notification: { request: { content: { data: { guestId: VALID_GUEST_ID } } } },
    });
    await captureInitialTap();
    expect(consumePendingTap()).toEqual(DRAFT_TAP);
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
    expect(consumePendingTap()).toEqual(DRAFT_TAP);
  });

  it('teardown removes the listener', () => {
    const remove = jest.fn();
    addNotificationResponseReceivedListenerMock.mockReturnValueOnce({ remove });
    const stop = wireTapResponseListener();
    stop();
    expect(remove).toHaveBeenCalled();
  });
});

// The arrival push for a heads-up card, shaped as analog-guest's
// lib/notifications/send-commitment-push.ts sends it:
// `{ aps: {alert, badge, sound}, commitmentId, guestId, operatorId }`.
// It used to parse as a draft tap with `commitmentId` silently stripped, which
// is how an operator got a notification for a card they could not open.
// (TAC-364.)
describe('parseTapPayload — an arrival push is a commitment tap (TAC-364)', () => {
  const COMMITMENT_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
  const ARRIVAL_PUSH = {
    aps: { alert: { title: 'Heads up', body: 'Sam arriving now' }, badge: 1, sound: 'default' },
    commitmentId: COMMITMENT_ID,
    guestId: VALID_GUEST_ID,
    operatorId: VALID_GUEST_ID,
  };

  it('routes to that commitment, not to a draft for the same guest', () => {
    expect(parseTapPayload(ARRIVAL_PUSH)).toEqual({
      kind: 'commitment',
      guestId: VALID_GUEST_ID,
      commitmentId: COMMITMENT_ID,
    });
  });

  it('still routes a draft push by guest', () => {
    expect(
      parseTapPayload({ draftId: VALID_DRAFT_ID, guestId: VALID_GUEST_ID }),
    ).toEqual({ kind: 'draft', guestId: VALID_GUEST_ID });
  });

  it('drops a push whose commitmentId is malformed rather than treating it as a draft tap', () => {
    expect(
      parseTapPayload({ ...ARRIVAL_PUSH, commitmentId: 'not-a-uuid' }),
    ).toBeNull();
  });

  it('carries a commitment tap through a cold launch', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce({
      notification: { request: { content: { data: ARRIVAL_PUSH } } },
    });
    await captureInitialTap();
    expect(consumePendingTap()).toEqual({
      kind: 'commitment',
      guestId: VALID_GUEST_ID,
      commitmentId: COMMITMENT_ID,
    });
  });
});
