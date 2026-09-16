import {
  getGuestThreadFixture,
  listConversationsFixture,
  resetConversationsFixture,
  subscribeConversationsFixture,
  triggerConversationActivityFixture,
} from '@/lib/fixtures/conversations';

beforeEach(() => {
  resetConversationsFixture();
});

// The one seeded guest with no counting message: an empty-bodied inbound and
// a pending draft, so `lastMessagePreview` is "". (TAC-411.)
const EMPTY_PREVIEW_GUEST_ID = 'c0ffffff-ffff-4fff-8fff-ffffffffffff';

describe('lib/fixtures/conversations', () => {
  it('seeds 15 conversations across two venues', () => {
    expect(listConversationsFixture()).toHaveLength(15);
  });

  it('every seeded row has real-shaped UUIDs and a direction', () => {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const c of listConversationsFixture()) {
      expect(uuidRe.test(c.guestId)).toBe(true);
      expect(uuidRe.test(c.venueId)).toBe(true);
      expect(['inbound', 'outbound']).toContain(c.lastMessageDirection);
    }
  });

  // Was "every seeded row has a non-empty preview". TAC-395's Contract makes
  // an empty preview a legitimate row, so the invariant is now that exactly
  // the guests with no counting message have one.
  it('gives every guest a non-empty preview except the one with no counting message', () => {
    for (const c of listConversationsFixture()) {
      if (c.guestId === EMPTY_PREVIEW_GUEST_ID) {
        expect(c.lastMessagePreview).toBe('');
      } else {
        expect(c.lastMessagePreview.length).toBeGreaterThan(0);
      }
    }
  });

  // The Contract's two branches, pinned against the seed.
  it('describes a guest by their newest COUNTING message, not their newest message', () => {
    // Maya's newest message is a pending draft. Her row must describe the
    // inbound before it, and her thread must not contain the draft.
    const maya = listConversationsFixture().find(
      (c) => c.guestId === 'c0111111-1111-4111-8111-111111111111',
    )!;
    expect(maya.lastMessagePreview).toBe(
      'Yes please! Two of us at 7:30 if you can swing it.',
    );
    expect(maya.lastMessageDirection).toBe('inbound');

    const thread = getGuestThreadFixture(maya.guestId);
    for (const m of thread) {
      expect(m.body).not.toBe(
        'Done — got you down for two at 7:30. The corner spot by the olive tree. See you tonight.',
      );
    }
  });

  it('gives a guest with no counting message an empty preview at the unsent draft\'s time', () => {
    const iris = listConversationsFixture().find(
      (c) => c.guestId === EMPTY_PREVIEW_GUEST_ID,
    )!;
    expect(iris.lastMessagePreview).toBe('');
    // "the row sorts, and shows as active, by the unsent draft's time, and
    // `lastMessageDirection` is usually `outbound`" — TAC-395 Contract.
    expect(iris.lastMessageDirection).toBe('outbound');
    // No counting message means no thread at all: the empty-bodied inbound
    // fails condition 1, the draft fails condition 2.
    expect(getGuestThreadFixture(iris.guestId)).toEqual([]);
  });

  it('holds no unsent draft body in any seeded thread', () => {
    // The fixture defect this ticket fixes: three pending draft bodies from
    // lib/fixtures/queue.ts were seeded here as ordinary sent messages.
    const draftBodies = [
      'Done — got you down for two at 7:30. The corner spot by the olive tree. See you tonight.',
      'We do — we keep a gluten-free penne behind the bar and run it through clean water. Just let your server know.',
      "We'll time a loaf for 7 — and there'll be a slice of the buckwheat cake for the table on us, since tomorrow's the day. Looking forward to meeting them.",
    ];
    for (const c of listConversationsFixture()) {
      for (const m of getGuestThreadFixture(c.guestId)) {
        expect(draftBodies).not.toContain(m.body);
      }
    }
  });

  it('getGuestThreadFixture returns that guest\'s messages oldest-first', () => {
    const [first] = listConversationsFixture();
    const messages = getGuestThreadFixture(first.guestId);
    expect(messages.length).toBeGreaterThan(0);
    const timestamps = messages.map((m) => Date.parse(m.createdAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    // The newest COUNTING message is what the row describes — which for a
    // guest whose newest message is an unsent draft is not the newest message.
    expect(messages[messages.length - 1].body).toBe(first.lastMessagePreview);
  });

  it('getGuestThreadFixture returns [] for an unknown guestId', () => {
    expect(getGuestThreadFixture('00000000-0000-4000-8000-000000000000')).toEqual([]);
  });

  it('triggerConversationActivityFixture appends a message and notifies subscribers', () => {
    const [target] = listConversationsFixture();
    const events: string[] = [];
    const unsubscribe = subscribeConversationsFixture((e) => events.push(e.type));

    const before = getGuestThreadFixture(target.guestId).length;
    triggerConversationActivityFixture(target.guestId, 'actually, can we push to 8?');
    const after = getGuestThreadFixture(target.guestId);

    expect(after).toHaveLength(before + 1);
    expect(after[after.length - 1].body).toBe('actually, can we push to 8?');
    expect(after[after.length - 1].direction).toBe('inbound');
    expect(events).toEqual(['conversations_changed']);

    const updatedSummary = listConversationsFixture().find((c) => c.guestId === target.guestId);
    expect(updatedSummary?.lastMessagePreview).toBe('actually, can we push to 8?');
    expect(updatedSummary?.lastMessageDirection).toBe('inbound');

    unsubscribe();
  });

  it('resetConversationsFixture restores the original 15-guest seed', () => {
    const [target] = listConversationsFixture();
    triggerConversationActivityFixture(target.guestId, 'a new message');
    resetConversationsFixture();
    expect(listConversationsFixture()).toHaveLength(15);
    expect(getGuestThreadFixture(target.guestId).at(-1)?.body).not.toBe('a new message');
  });
});
