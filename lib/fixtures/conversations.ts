// In-memory fixture data for the Conversations tab, ported from the imported
// "Conversations Tab.dc.html" design's Component.seed(). Follows the exact
// persistent-Map + reseed() pattern lib/fixtures/queue.ts already
// established, so behavior (including the live-simulation trigger) is
// consistent between the two fixture modules.

import { DISPLAY_MARGIN_MS } from '@/lib/reply-window';

import { fixtureUuid } from './queue';
import { FIXTURE_CENTRAL_PERK_ID, FIXTURE_SEXTANT_ID } from './venues';

export type ConversationRecognitionState = 'new' | 'returning' | 'regular' | 'raving_fan';

export interface ConversationSummary {
  guestId: string;
  venueId: string;
  venueSlug: string;
  venueTimezone: string | null;
  agentName: string;
  name: string | null;
  phoneFallback: string;
  /** TAC-473 Contract. Structurally mirrors `ConversationSummarySchema`. */
  guestChannel: 'text' | 'instagram';
  replyWindowExpiresAt: string | null;
  instagramUsername: string | null;
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
  /**
   * A row that exists but never reached the guest: a pending draft, a skipped
   * draft, or an approved reply whose send never happened.
   *
   * It is deliberately NOT a thread message — `buildRecord` keeps it out of
   * `messages[]` — but it still drives `lastMessageAt`, `lastMessageDirection`
   * and the counts, exactly as TAC-395's Contract specifies for the
   * conversations list (21:55 ruling, option (i)). That is the only way to
   * seed a guest with `lastMessagePreview: ""`, which cannot otherwise be
   * expressed: the preview is derived from a message body. (TAC-411.)
   */
  unsent?: true;
}

interface SeedGuest {
  guestId: string;
  name: string | null;
  phoneFallback: string;
  /**
   * Instagram identity (TAC-473). Defaults to a text guest, so every seed row
   * written before TAC-486 renders exactly as it did.
   *
   * `windowMinutesLeft` is what the card should SHOW; the display margin is
   * added back on in `buildRecord`. `undefined` leaves the deadline null, which
   * on an Instagram guest reads as "unknown", never as expired.
   */
  guestChannel?: 'text' | 'instagram';
  instagramUsername?: string | null;
  windowMinutesLeft?: number;
  recognitionState: ConversationRecognitionState;
  conversationCount: number;
  firstConversationDaysAgo: number;
  messages: SeedMessage[]; // oldest first
  /** Defaults to SEXTANT, so the pre-existing seed rows are unchanged. */
  venue?: FixtureVenue;
}

interface FixtureVenue {
  id: string;
  slug: string;
  timezone: string;
  agentName: string;
}

// Two venues, matching the ids lib/fixtures/queue.ts already uses, so fixture
// mode can exercise venue filtering end to end. Before TAC-382 every row here
// carried the same venue, which meant a filter bug on the conversations side
// was invisible offline — the list looked identical filtered or not.
const SEXTANT: FixtureVenue = {
  id: FIXTURE_SEXTANT_ID,
  slug: 'mock-sextant-coffee-roasters',
  timezone: 'America/Los_Angeles',
  agentName: 'Sana',
};

const CENTRAL_PERK: FixtureVenue = {
  id: FIXTURE_CENTRAL_PERK_ID,
  slug: 'mock-central-perk',
  timezone: 'America/New_York',
  agentName: 'Gunther',
};

function seedGuests(): SeedGuest[] {
  return [
    // Instagram guests (TAC-486). One named, one not: the unnamed row is the
    // blank-name case, which now reads as the handle rather than as nothing.
    {
      guestId: 'c0999999-9999-4999-8999-999999999999',
      name: 'Mia B.',
      phoneFallback: '',
      guestChannel: 'instagram',
      instagramUsername: 'mia.brews',
      windowMinutesLeft: 51,
      recognitionState: 'regular',
      conversationCount: 4,
      firstConversationDaysAgo: 110,
      messages: [
        {
          direction: 'inbound',
          body: 'the flat white on saturday was cold, we were pretty disappointed',
          minsAgo: 14,
        },
        {
          direction: 'outbound',
          body: 'Sorry about Saturday. Your next round is on us, come in any time this week.',
          minsAgo: 10,
        },
        {
          direction: 'inbound',
          body: 'also is there parking near you in the evening?',
          minsAgo: 6,
        },
      ],
    },
    {
      guestId: 'c0888888-8888-4888-8888-888888888888',
      name: null,
      phoneFallback: '',
      guestChannel: 'instagram',
      instagramUsername: 'lena.eats',
      recognitionState: 'new',
      conversationCount: 1,
      firstConversationDaysAgo: 1,
      messages: [
        {
          direction: 'inbound',
          body: 'do you take walk-ins on saturdays',
          minsAgo: 27 * 60,
        },
      ],
    },
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
        // Verbatim the pending draftBody at lib/fixtures/queue.ts:135-136 —
        // seeded here as a sent message before TAC-411. Unsent: it is a draft
        // awaiting review, so the thread must not show it.
        { direction: 'outbound', body: 'Done — got you down for two at 7:30. The corner spot by the olive tree. See you tonight.', minsAgo: 2, unsent: true },
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
        // Reworded in TAC-411: the previous text was verbatim the pending
        // draftBody at lib/fixtures/queue.ts:165-166, so the same sentence sat
        // in the queue composer and in a sent Conversations bubble at once.
        // Not marked unsent — it is mid-thread and the exchange continues past
        // it, so removing it would leave the next inbound answering nothing.
        { direction: 'outbound', body: 'We do keep a gluten-free penne, cooked in its own water. Tell your server when you sit down.', minsAgo: 15 },
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
        // Verbatim the pending draftBody at lib/fixtures/queue.ts:202-203.
        { direction: 'outbound', body: "We'll time a loaf for 7 — and there'll be a slice of the buckwheat cake for the table on us, since tomorrow's the day. Looking forward to meeting them.", minsAgo: 18, unsent: true },
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
    // Central Perk. Deliberately interleaved in recency with the Sextant rows
    // above rather than appended after them, so a filter that quietly does
    // nothing shows up as foreign names in the list instead of hiding at the
    // bottom where nobody scrolls.
    {
      guestId: 'c0dddddd-dddd-4ddd-8ddd-dddddddddddd',
      name: 'Ross G.',
      phoneFallback: '+15551110051',
      recognitionState: 'raving_fan',
      conversationCount: 31,
      firstConversationDaysAgo: 540,
      venue: CENTRAL_PERK,
      messages: [
        { direction: 'inbound', body: 'is the big orange couch free around 4?', minsAgo: 38 },
        { direction: 'outbound', body: "It's open right now and nobody's booked it. Come by.", minsAgo: 31 },
      ],
    },
    // The empty-preview case, and the only guest here with NO counting
    // message (TAC-411). She sent a photo of the pastry case with no text —
    // an empty body, which fails the Contract's condition 1 — and the agent's
    // reply to it is still pending review, which fails condition 2. So her
    // thread is empty, her preview is "", and her row sorts by the unsent
    // draft's time with `lastMessageDirection: 'outbound'`, exactly the
    // Contract's "usually outbound" case. Seeded so fixture mode renders the
    // speakerless row and the empty thread without a backend.
    {
      guestId: 'c0ffffff-ffff-4fff-8fff-ffffffffffff',
      name: 'Iris M.',
      phoneFallback: '+15551110055',
      recognitionState: 'new',
      conversationCount: 1,
      firstConversationDaysAgo: 0,
      messages: [
        { direction: 'inbound', body: '', minsAgo: 9 },
        {
          direction: 'outbound',
          body: 'That’s our cardamom bun, out of the oven at 8 most mornings. Want me to set one aside?',
          minsAgo: 7,
          unsent: true,
        },
      ],
    },
    {
      guestId: 'c0eeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      name: 'Phoebe B.',
      phoneFallback: '+15551110052',
      recognitionState: 'returning',
      conversationCount: 4,
      firstConversationDaysAgo: 61,
      venue: CENTRAL_PERK,
      messages: [
        { direction: 'inbound', body: 'do you have oat milk now?', minsAgo: 2100 },
        { direction: 'outbound', body: 'We do — oat and soy both, since last month.', minsAgo: 2090 },
      ],
    },
  ];
}

interface ConversationRecord extends ConversationSummary {
  messages: ThreadMessage[];
}

/**
 * Mirrors what the server returns per TAC-395's Contract, conversations list.
 * Two branches, and they are NOT the same rule with a different preview:
 *
 * - **A guest with at least one counting message:** `lastMessageAt`,
 *   `lastMessageDirection` AND `lastMessagePreview` all describe their newest
 *   COUNTING message. An unsent draft newer than it changes nothing on the
 *   row — the row does not jump to the draft's time.
 * - **A guest with none** (only unsent drafts): `lastMessagePreview` is `""`,
 *   and `lastMessageAt` / `lastMessageDirection` come from their newest
 *   non-empty message whatever its state — so the row still sorts, and shows
 *   as active, by the unsent draft's time, with the direction usually
 *   `outbound` (21:55 ruling, option (i)).
 *
 * `messages[]` (the thread) holds only counting messages in both branches.
 * `conversationCount` and `firstConversationAt` stay hand-seeded here rather
 * than derived; the Contract's computation rules for them are the server's.
 * (TAC-411.)
 */
function buildRecord(seed: SeedGuest, now: number): ConversationRecord {
  const at = (m: SeedMessage): string =>
    new Date(now - m.minsAgo * 60_000).toISOString();

  // Both of the Contract's conditions: an empty body never counts either
  // (a reaction, or a photo-only text), which is what lets a guest have no
  // counting message at all despite having texted.
  const counting = seed.messages.filter((m) => !m.unsent && m.body !== '');
  const messages: ThreadMessage[] = counting.map((m) => ({
    id: fixtureUuid(),
    direction: m.direction,
    body: m.body,
    createdAt: at(m),
  }));

  // Newest by position: SeedGuest.messages is oldest-first by contract.
  const nonEmpty = seed.messages.filter((m) => m.body !== '');
  const newestCounting = counting[counting.length - 1];
  // `noUncheckedIndexedAccess` is off, so both index reads type as
  // SeedMessage and the compiler cannot see this. A seed guest with no
  // non-empty message at all has nothing to date the row from; the server
  // never lists one (migration 043 filters `body <> ''` before grouping), so
  // fail loudly at seed time rather than emit a row that cannot exist.
  const describes = newestCounting ?? nonEmpty[nonEmpty.length - 1];
  if (!describes) {
    throw new Error(
      `Fixture seed guest ${seed.guestId} has no non-empty message; ` +
        'every guest needs at least one to date and sort their row.',
    );
  }

  const venue = seed.venue ?? SEXTANT;
  return {
    guestId: seed.guestId,
    venueId: venue.id,
    venueSlug: venue.slug,
    venueTimezone: venue.timezone,
    agentName: venue.agentName,
    name: seed.name,
    phoneFallback: seed.phoneFallback,
    guestChannel: seed.guestChannel ?? 'text',
    replyWindowExpiresAt:
      seed.windowMinutesLeft === undefined
        ? null
        : new Date(
            now + seed.windowMinutesLeft * 60_000 + DISPLAY_MARGIN_MS,
          ).toISOString(),
    instagramUsername: seed.instagramUsername ?? null,
    recognitionState: seed.recognitionState,
    lastMessageAt: at(describes),
    lastMessageDirection: describes.direction,
    lastMessagePreview: newestCounting ? newestCounting.body : '',
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
