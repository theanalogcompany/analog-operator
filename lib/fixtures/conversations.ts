// In-memory fixture data for the Conversations tab, ported from the imported
// "Conversations Tab.dc.html" design's Component.seed(). Follows the exact
// persistent-Map + reseed() pattern lib/fixtures/queue.ts already
// established, so behavior (including the live-simulation trigger) is
// consistent between the two fixture modules.

import { fixtureUuid } from './queue';

export type ConversationRecognitionState = 'new' | 'returning' | 'regular' | 'raving_fan';

export interface ConversationSummary {
  guestId: string;
  venueId: string;
  venueSlug: string;
  venueTimezone: string | null;
  agentName: string;
  name: string | null;
  phoneFallback: string;
  recognitionState: ConversationRecognitionState | null;
  lastMessageAt: string;
  lastMessageDirection: 'inbound' | 'outbound';
  lastMessagePreview: string;
  conversationCount: number;
  firstConversationAt: string;
}

export interface ThreadMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  createdAt: string;
}

interface SeedMessage {
  direction: 'inbound' | 'outbound';
  body: string;
  minsAgo: number;
}

interface SeedGuest {
  guestId: string;
  name: string | null;
  phoneFallback: string;
  recognitionState: ConversationRecognitionState;
  conversationCount: number;
  firstConversationDaysAgo: number;
  messages: SeedMessage[]; // oldest first
}

const VENUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_SLUG = 'mock-sextant-coffee-roasters';
const VENUE_TIMEZONE = 'America/Los_Angeles';
const AGENT_NAME = 'Sana';

function seedGuests(): SeedGuest[] {
  return [
    {
      guestId: 'c0111111-1111-4111-8111-111111111111',
      name: 'Maya R.',
      phoneFallback: '+15551110001',
      recognitionState: 'returning',
      conversationCount: 4,
      firstConversationDaysAgo: 90,
      messages: [
        { direction: 'inbound', body: 'hey! is dinner walk-in friendly tonight?', minsAgo: 7220 },
        { direction: 'outbound', body: "walk-ins welcome — patio runs first-come on weekday nights.", minsAgo: 7215 },
        { direction: 'inbound', body: 'perfect, see you around 7', minsAgo: 7210 },
        { direction: 'inbound', body: 'Hi! Is the patio open tonight?', minsAgo: 10 },
        { direction: 'outbound', body: "Yes — patio's open until 9. Want me to hold a corner table?", minsAgo: 6 },
        { direction: 'inbound', body: 'Yes please! Two of us at 7:30 if you can swing it.', minsAgo: 4 },
        { direction: 'outbound', body: 'Done — got you down for two at 7:30. The corner spot by the olive tree. See you tonight.', minsAgo: 2 },
      ],
    },
    {
      guestId: 'c0222222-2222-4222-8222-222222222222',
      name: null,
      phoneFallback: '+15550182246',
      recognitionState: 'new',
      conversationCount: 1,
      firstConversationDaysAgo: 0,
      messages: [
        { direction: 'inbound', body: 'do you guys do gluten free pasta', minsAgo: 20 },
        { direction: 'outbound', body: 'We do — we keep a gluten-free penne behind the bar and run it through clean water. Just let your server know.', minsAgo: 15 },
        { direction: 'inbound', body: 'amazing, booking for 8', minsAgo: 12 },
        { direction: 'outbound', body: "See you at 8. I'll note the gluten-free penne on the ticket.", minsAgo: 9 },
        { direction: 'inbound', body: 'perfect thank you, see you at 8', minsAgo: 6 },
      ],
    },
    {
      guestId: 'c0333333-3333-4333-8333-333333333333',
      name: 'Tomas B.',
      phoneFallback: '+15551110007',
      recognitionState: 'regular',
      conversationCount: 19,
      firstConversationDaysAgo: 180,
      messages: [
        { direction: 'inbound', body: 'table for two tonight?', minsAgo: 200 },
        { direction: 'outbound', body: 'Got you at 8 — the two-top by the window, like usual.', minsAgo: 190 },
        { direction: 'inbound', body: 'can we push to 8:15? traffic on the bridge', minsAgo: 20 },
        { direction: 'outbound', body: '8:15 is yours. Same table.', minsAgo: 12 },
      ],
    },
    {
      guestId: 'c0444444-4444-4444-8444-444444444444',
      name: 'Devon L.',
      phoneFallback: '+15551110003',
      recognitionState: 'raving_fan',
      conversationCount: 31,
      firstConversationDaysAgo: 240,
      messages: [
        { direction: 'inbound', body: 'the buckwheat cake last sunday was unreal', minsAgo: 14400 },
        { direction: 'outbound', body: 'so glad — we play with that recipe quarterly, this batch had the flax.', minsAgo: 14395 },
        { direction: 'inbound', body: "Bringing my parents tomorrow — they're only in town one night.", minsAgo: 40 },
        { direction: 'inbound', body: 'Any chance you have the rosemary loaf coming out around 7?', minsAgo: 25 },
        { direction: 'outbound', body: "We'll time a loaf for 7 — and there'll be a slice of the buckwheat cake for the table on us, since tomorrow's the day. Looking forward to meeting them.", minsAgo: 18 },
      ],
    },
    {
      guestId: 'c0555555-5555-4555-8555-555555555555',
      name: 'Elise W.',
      phoneFallback: '+15551110011',
      recognitionState: 'new',
      conversationCount: 1,
      firstConversationDaysAgo: 0,
      messages: [
        { direction: 'inbound', body: 'hi, do you have a corkage fee?', minsAgo: 50 },
        { direction: 'outbound', body: "$25 a bottle, waived if you're doing the tasting menu.", minsAgo: 45 },
        { direction: 'inbound', body: 'good to know, thanks', minsAgo: 41 },
      ],
    },
    {
      guestId: 'c0666666-6666-4666-8666-666666666666',
      name: 'Hana K.',
      phoneFallback: '+15551110014',
      recognitionState: 'returning',
      conversationCount: 6,
      firstConversationDaysAgo: 120,
      messages: [
        { direction: 'inbound', body: 'is the patio warm enough this late in the year?', minsAgo: 130 },
        { direction: 'outbound', body: 'Anytime — the patio heaters are on until close.', minsAgo: 122 },
      ],
    },
    {
      guestId: 'c0777777-7777-4777-8777-777777777777',
      name: 'Marcus D.',
      phoneFallback: '+15551110018',
      recognitionState: 'raving_fan',
      conversationCount: 44,
      firstConversationDaysAgo: 660,
      messages: [
        { direction: 'inbound', body: 'saving me a loaf on saturday?', minsAgo: 200 },
        { direction: 'outbound', body: "Two, if you want them. I'll put your name on the shelf.", minsAgo: 190 },
      ],
    },
    {
      guestId: 'c0888888-8888-4888-8888-888888888888',
      name: 'Rae O.',
      phoneFallback: '+15551110022',
      recognitionState: 'new',
      conversationCount: 1,
      firstConversationDaysAgo: 0,
      messages: [
        { direction: 'inbound', body: 'do you take walk-ins for brunch', minsAgo: 315 },
        { direction: 'outbound', body: 'We do — brunch is walk-in only, 9 to 2 on weekends.', minsAgo: 305 },
      ],
    },
    {
      guestId: 'c0999999-9999-4999-8999-999999999999',
      name: 'Jun P.',
      phoneFallback: '+15551110025',
      recognitionState: 'regular',
      conversationCount: 12,
      firstConversationDaysAgo: 150,
      messages: [
        { direction: 'inbound', body: 'same time thursday?', minsAgo: 1510 },
        { direction: 'outbound', body: 'Booked. 7:30, table four.', minsAgo: 1500 },
      ],
    },
    {
      guestId: 'c0aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Sofia L.',
      phoneFallback: '+15551110029',
      recognitionState: 'returning',
      conversationCount: 3,
      firstConversationDaysAgo: 60,
      messages: [
        { direction: 'inbound', body: 'left my sunglasses at the bar last night', minsAgo: 1620 },
        { direction: 'outbound', body: "They're behind the register — come by anytime this week.", minsAgo: 1610 },
      ],
    },
    {
      guestId: 'c0bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Ben A.',
      phoneFallback: '+15551110033',
      recognitionState: 'new',
      conversationCount: 1,
      firstConversationDaysAgo: 0,
      messages: [
        { direction: 'inbound', body: 'are dogs ok on the patio', minsAgo: 2910 },
        { direction: 'outbound', body: 'Dogs are very welcome on the patio. Water bowl by the door.', minsAgo: 2900 },
      ],
    },
    {
      guestId: 'c0cccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: 'Nadia S.',
      phoneFallback: '+15551110041',
      recognitionState: 'regular',
      conversationCount: 9,
      firstConversationDaysAgo: 210,
      messages: [
        { direction: 'inbound', body: 'can you do a birthday thing for six on the 20th?', minsAgo: 4310 },
        { direction: 'outbound', body: "Six on the 20th is in the book. I'll ask the kitchen about a candle.", minsAgo: 4300 },
      ],
    },
  ];
}

interface ConversationRecord extends ConversationSummary {
  messages: ThreadMessage[];
}

function buildRecord(seed: SeedGuest, now: number): ConversationRecord {
  const messages: ThreadMessage[] = seed.messages.map((m) => ({
    id: fixtureUuid(),
    direction: m.direction,
    body: m.body,
    createdAt: new Date(now - m.minsAgo * 60_000).toISOString(),
  }));
  const last = messages[messages.length - 1];
  return {
    guestId: seed.guestId,
    venueId: VENUE_ID,
    venueSlug: VENUE_SLUG,
    venueTimezone: VENUE_TIMEZONE,
    agentName: AGENT_NAME,
    name: seed.name,
    phoneFallback: seed.phoneFallback,
    recognitionState: seed.recognitionState,
    lastMessageAt: last.createdAt,
    lastMessageDirection: last.direction,
    lastMessagePreview: last.body,
    conversationCount: seed.conversationCount,
    firstConversationAt: new Date(
      now - seed.firstConversationDaysAgo * 24 * 60 * 60_000,
    ).toISOString(),
    messages,
  };
}

const conversations: Map<string, ConversationRecord> = new Map();

function reseed(): void {
  conversations.clear();
  const now = Date.now();
  for (const seed of seedGuests()) {
    conversations.set(seed.guestId, buildRecord(seed, now));
  }
}

reseed();

export function listConversationsFixture(): ConversationSummary[] {
  return Array.from(conversations.values()).map(({ messages: _messages, ...summary }) => summary);
}

export function getGuestThreadFixture(guestId: string): ThreadMessage[] {
  return conversations.get(guestId)?.messages ?? [];
}

export function resetConversationsFixture(): void {
  reseed();
}

export type ConversationsFixtureEvent = { type: 'conversations_changed' };
type ConversationsFixtureSubscriber = (event: ConversationsFixtureEvent) => void;

const subscribers: Set<ConversationsFixtureSubscriber> = new Set();

export function subscribeConversationsFixture(fn: ConversationsFixtureSubscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function emitConversationsChanged(): void {
  subscribers.forEach((fn) => fn({ type: 'conversations_changed' }));
}

/**
 * Dev/manual-QA hook: appends a synthetic inbound message to one guest and
 * broadcasts a conversations_changed event, mirroring the imported design's
 * simulated "live" delivery (Component.deliver()). Not wired to any timer —
 * a screen, a dev console, or a test calls this explicitly.
 */
export function triggerConversationActivityFixture(guestId: string, body: string): void {
  const record = conversations.get(guestId);
  if (!record) return;
  const message: ThreadMessage = {
    id: fixtureUuid(),
    direction: 'inbound',
    body,
    createdAt: new Date().toISOString(),
  };
  record.messages = [...record.messages, message];
  record.lastMessageAt = message.createdAt;
  record.lastMessageDirection = message.direction;
  record.lastMessagePreview = message.body;
  emitConversationsChanged();
}
