import * as Notifications from 'expo-notifications';

import {
  __resetTapStateForTests,
  captureInitialTap,
  consumePendingTap,
  parseTapPayload,
  parseTapResponse,
  resolveTapPayload,
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
  it('returns guestId and draftId for a valid payload', () => {
    expect(
      parseTapPayload({
        guestId: VALID_GUEST_ID,
        draftId: VALID_DRAFT_ID,
        operatorId: VALID_GUEST_ID,
      }),
    ).toStrictEqual({ kind: 'draft', guestId: VALID_GUEST_ID, draftId: VALID_DRAFT_ID });
  });

  // `toStrictEqual`: `toEqual` treats a missing key and an `undefined` one as
  // equal, so it would pass a parse that sets `draftId: undefined` instead of
  // leaving the key off. (TAC-403.)
  it('accepts payload with only guestId (draftId + operatorId optional)', () => {
    expect(parseTapPayload({ guestId: VALID_GUEST_ID })).toStrictEqual(DRAFT_TAP);
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

  it('still routes a draft push as a draft tap, to the draft it names', () => {
    expect(
      parseTapPayload({ draftId: VALID_DRAFT_ID, guestId: VALID_GUEST_ID }),
    ).toStrictEqual({ kind: 'draft', guestId: VALID_GUEST_ID, draftId: VALID_DRAFT_ID });
  });

  // Neither Contract payload carries both ids. If one ever does, it is a
  // commitment tap. The parser keeps `draftId` now, so the order of its checks
  // is what decides. (TAC-403.)
  it('routes a push carrying both ids to the commitment, not the draft', () => {
    expect(parseTapPayload({ ...ARRIVAL_PUSH, draftId: VALID_DRAFT_ID })).toStrictEqual({
      kind: 'commitment',
      guestId: VALID_GUEST_ID,
      commitmentId: COMMITMENT_ID,
    });
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

// The draft push, shaped as TAC-403's `## Contract` gives it, unchanged since
// TAC-207: `{ aps: {alert, badge, sound}, draftId, guestId, operatorId }`, where
// `draftId` is the pending draft's `messages.id`, the queue's `messageId`. Since
// TAC-394 a guest can hold two pending drafts, so the guest alone no longer
// names the card and the tap has to keep `draftId`. (TAC-403.)
describe('parseTapPayload — a draft push names its draft (TAC-403)', () => {
  const OPERATOR_ID = '9b2e4c1a-7d3f-4e8b-a1c5-6f0d2e3b4a59';
  const DRAFT_PUSH = {
    aps: { alert: { title: '...', body: '...' }, badge: 1, sound: 'default' },
    draftId: VALID_DRAFT_ID,
    guestId: VALID_GUEST_ID,
    operatorId: OPERATOR_ID,
  };
  const NAMED_DRAFT_TAP = { kind: 'draft', guestId: VALID_GUEST_ID, draftId: VALID_DRAFT_ID };

  it('keeps the draftId the push names', () => {
    expect(parseTapPayload(DRAFT_PUSH)).toStrictEqual(NAMED_DRAFT_TAP);
  });

  it('drops a push whose draftId is malformed rather than routing it by guest', () => {
    expect(parseTapPayload({ ...DRAFT_PUSH, draftId: 'not-a-uuid' })).toBeNull();
  });

  it('carries the draftId through a cold launch', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValueOnce({
      notification: { request: { content: { data: DRAFT_PUSH } } },
    });
    await captureInitialTap();
    expect(consumePendingTap()).toStrictEqual(NAMED_DRAFT_TAP);
  });

  it('carries the draftId through a warm launch', () => {
    let captured: ((r: unknown) => void) | null = null;
    addNotificationResponseReceivedListenerMock.mockImplementation((cb) => {
      captured = cb;
      return { remove: jest.fn() };
    });
    wireTapResponseListener();
    expect(captured).not.toBeNull();
    captured!({ notification: { request: { content: { data: DRAFT_PUSH } } } });
    expect(consumePendingTap()).toStrictEqual(NAMED_DRAFT_TAP);
  });
});


// ---------------------------------------------------------------------------
// TAC-419 — the payload the NATIVE SERIALIZER actually hands JS.
//
// Every test above this line hands `content.data` the push body directly. That
// is the rule-#5 corollary in CLAUDE.md: a test that bypasses a boundary cannot
// make a claim about it. Those tests stayed green for the entire life of the
// defect, because the shape they feed is not the shape the device produces.
//
// These build the response the way `EXNotificationSerializer` really delivers a
// REMOTE push: `content.data` null, the custom fields on `trigger.payload`
// beside `aps`. Transcribed from a production cold launch on 2026-09-22:
//
//   [apns] tap envelope { source:'coldlaunch', data:'null', triggerType:'push',
//                         trigger:'object{aps,draftId,guestId,operatorId}' }
//   [apns] tap parse FAILED { data:'null',
//                             zod:'expected object, received null' }
//
// Not transcribed from `resolveTapPayload`, and not from a passing run.
// ---------------------------------------------------------------------------
describe('remote push delivery — content.data is null, the fields ride the trigger (TAC-419)', () => {
  const OPERATOR_ID = '9b2e4c1a-7d3f-4e8b-a1c5-6f0d2e3b4a59';
  const VALID_COMMITMENT_ID = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  const APS = { alert: { title: 'Le Mil\'s Coffee', body: 'A reply is ready' }, badge: 1, sound: 'default' };

  /** A remote push as the device delivers it: data starved, payload whole. */
  const remoteResponse = (userInfo: Record<string, unknown>) => ({
    notification: {
      request: {
        content: { data: null, title: 'Le Mil\'s Coffee', body: 'A reply is ready' },
        trigger: { type: 'push', payload: userInfo },
      },
    },
  });

  const DRAFT_USER_INFO = {
    aps: APS,
    draftId: VALID_DRAFT_ID,
    guestId: VALID_GUEST_ID,
    operatorId: OPERATOR_ID,
  };
  const ARRIVAL_USER_INFO = {
    aps: APS,
    commitmentId: VALID_COMMITMENT_ID,
    guestId: VALID_GUEST_ID,
    operatorId: OPERATOR_ID,
  };

  const NAMED_DRAFT_TAP = { kind: 'draft', guestId: VALID_GUEST_ID, draftId: VALID_DRAFT_ID };
  const COMMITMENT_TAP = {
    kind: 'commitment',
    guestId: VALID_GUEST_ID,
    commitmentId: VALID_COMMITMENT_ID,
  };

  describe('resolveTapPayload', () => {
    it('falls back to trigger.payload when content.data is null', () => {
      expect(resolveTapPayload(remoteResponse(DRAFT_USER_INFO))).toStrictEqual(DRAFT_USER_INFO);
    });

    it('falls back when content.data is undefined rather than null', () => {
      const response = {
        notification: {
          request: { content: {}, trigger: { type: 'push', payload: DRAFT_USER_INFO } },
        },
      };
      expect(resolveTapPayload(response)).toStrictEqual(DRAFT_USER_INFO);
    });

    // A LOCAL notification is serialized with the whole userInfo as
    // content.data and carries no push trigger. It must not be re-routed.
    it('prefers content.data when it is present', () => {
      const response = {
        notification: {
          request: {
            content: { data: DRAFT_USER_INFO },
            trigger: { type: 'push', payload: { guestId: 'should-not-be-read' } },
          },
        },
      };
      expect(resolveTapPayload(response)).toStrictEqual(DRAFT_USER_INFO);
    });

    it('returns undefined when neither source carries a usable object', () => {
      expect(
        resolveTapPayload({ notification: { request: { content: { data: null }, trigger: null } } }),
      ).toBeUndefined();
      expect(resolveTapPayload({})).toBeUndefined();
      expect(resolveTapPayload(null)).toBeUndefined();
    });

    // The way TAC-419 could silently come back. The serializer returns
    // `userInfo["body"]` whatever its type, so a sender adding a top-level
    // `body` string would make content.data non-nullish but unparseable. A bare
    // non-nullish check would return it and never consult the trigger.
    it('ignores a non-object content.data and still reaches the trigger', () => {
      const withBodyString = {
        notification: {
          request: {
            content: { data: 'A reply is ready' },
            trigger: { type: 'push', payload: DRAFT_USER_INFO },
          },
        },
      };
      expect(resolveTapPayload(withBodyString)).toStrictEqual(DRAFT_USER_INFO);
      expect(parseTapResponse(withBodyString)).toStrictEqual(NAMED_DRAFT_TAP);
    });

    it('ignores an array content.data, which a z.object can never accept', () => {
      const withArray = {
        notification: {
          request: {
            content: { data: [] },
            trigger: { type: 'push', payload: DRAFT_USER_INFO },
          },
        },
      };
      expect(resolveTapPayload(withArray)).toStrictEqual(DRAFT_USER_INFO);
    });
  });

  describe('parseTapResponse', () => {
    // `aps` rides along on trigger.payload. TapPayloadSchema is a non-strict
    // z.object, so it is stripped at the parse boundary rather than rejected.
    it('routes a draft push to the draft it names, with aps present', () => {
      expect(parseTapResponse(remoteResponse(DRAFT_USER_INFO))).toStrictEqual(NAMED_DRAFT_TAP);
    });

    it('routes an arrival push to that commitment', () => {
      expect(parseTapResponse(remoteResponse(ARRIVAL_USER_INFO))).toStrictEqual(COMMITMENT_TAP);
    });

    // The exact pre-fix failure: this returned null on every push ever sent.
    it('is what the old content.data-only read could not do', () => {
      expect(parseTapPayload(remoteResponse(DRAFT_USER_INFO).notification.request.content.data))
        .toBeNull();
      expect(parseTapResponse(remoteResponse(DRAFT_USER_INFO))).toStrictEqual(NAMED_DRAFT_TAP);
    });

    it('still drops a malformed payload rather than navigating anywhere', () => {
      expect(
        parseTapResponse(remoteResponse({ ...DRAFT_USER_INFO, guestId: 'not-a-uuid' })),
      ).toBeNull();
    });
  });

  describe('both entry points, both push kinds', () => {
    it('cold launch surfaces a draft push', async () => {
      getLastNotificationResponseAsyncMock.mockResolvedValueOnce(remoteResponse(DRAFT_USER_INFO));
      await captureInitialTap();
      expect(consumePendingTap()).toStrictEqual(NAMED_DRAFT_TAP);
    });

    it('cold launch surfaces an arrival push', async () => {
      getLastNotificationResponseAsyncMock.mockResolvedValueOnce(remoteResponse(ARRIVAL_USER_INFO));
      await captureInitialTap();
      expect(consumePendingTap()).toStrictEqual(COMMITMENT_TAP);
    });

    it('warm launch surfaces a draft push', () => {
      let captured: ((r: unknown) => void) | null = null;
      addNotificationResponseReceivedListenerMock.mockImplementation((cb) => {
        captured = cb;
        return { remove: jest.fn() };
      });
      wireTapResponseListener();
      captured!(remoteResponse(DRAFT_USER_INFO));
      expect(consumePendingTap()).toStrictEqual(NAMED_DRAFT_TAP);
    });

    it('warm launch surfaces an arrival push', () => {
      let captured: ((r: unknown) => void) | null = null;
      addNotificationResponseReceivedListenerMock.mockImplementation((cb) => {
        captured = cb;
        return { remove: jest.fn() };
      });
      wireTapResponseListener();
      captured!(remoteResponse(ARRIVAL_USER_INFO));
      expect(consumePendingTap()).toStrictEqual(COMMITMENT_TAP);
    });
  });
});
