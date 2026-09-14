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

describe('lib/fixtures/conversations', () => {
  it('seeds 14 conversations across two venues', () => {
    expect(listConversationsFixture()).toHaveLength(14);
  });

  it('every seeded row has real-shaped UUIDs and a non-empty preview', () => {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const c of listConversationsFixture()) {
      expect(uuidRe.test(c.guestId)).toBe(true);
      expect(uuidRe.test(c.venueId)).toBe(true);
      expect(c.lastMessagePreview.length).toBeGreaterThan(0);
      expect(['inbound', 'outbound']).toContain(c.lastMessageDirection);
    }
  });

  it('getGuestThreadFixture returns that guest\'s messages oldest-first', () => {
    const [first] = listConversationsFixture();
    const messages = getGuestThreadFixture(first.guestId);
    expect(messages.length).toBeGreaterThan(0);
    const timestamps = messages.map((m) => Date.parse(m.createdAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
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

  it('resetConversationsFixture restores the original 14-guest seed', () => {
    const [target] = listConversationsFixture();
    triggerConversationActivityFixture(target.guestId, 'a new message');
    resetConversationsFixture();
    expect(listConversationsFixture()).toHaveLength(14);
    expect(getGuestThreadFixture(target.guestId).at(-1)?.body).not.toBe('a new message');
  });
});
