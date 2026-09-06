import { createConversationsChannel } from '@/lib/realtime/conversations-channel';
import {
  resetConversationsFixture,
  triggerConversationActivityFixture,
} from '@/lib/fixtures/conversations';

const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;

afterAll(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
});

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
  resetConversationsFixture();
});

describe('createConversationsChannel in fixture mode', () => {
  it('forwards conversations_changed events from the fixture emitter', () => {
    const events: string[] = [];
    const channel = createConversationsChannel({
      operatorId: 'op-1',
      venueIds: ['v1'],
      accessToken: 't',
      onEvent: (e) => events.push(e.type),
    });

    const [{ guestId }] = require('@/lib/fixtures/conversations').listConversationsFixture();
    triggerConversationActivityFixture(guestId, 'ping');

    expect(events).toEqual(['conversations_changed']);
    channel.unsubscribe();
  });
});
