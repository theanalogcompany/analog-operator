# Conversations Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Conversations" tab alongside the existing Queue — a live list of every guest conversation (not just pending drafts), with active/type filtering and a read-only thread viewer — matching the imported `Conversations Tab.dc.html` design.

**Architecture:** A new `app/conversations/` route branch (list + thread screens) sits beside the existing `/queue` stack. Both share one lifted `useQueue()` instance (moved from `app/queue/_layout.tsx` to the root layout) so the tab header's live queue count is consistent everywhere, and a new `useConversations()` hook (mirroring `useQueue()`'s shape) drives the list. Data flows through the same errors-as-values / Zod / fixture-mode conventions as the existing queue: `lib/api/conversations.ts` branches to `lib/fixtures/conversations.ts` today, and to the two new `analog-guest` endpoints once that sibling plan is curl-verified. The thread viewer reuses the existing `lib/thread-cluster.ts` clustering logic and a newly-extracted `ThreadBubbleList` component shared with the edit screen.

**Tech Stack:** Expo Router, React Native, NativeWind, Zod, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-05-conversations-tab-design.md` — the "`analog-operator` implementation" section is what this plan implements. The sibling backend plan is `../../../analog-guest/docs/superpowers/plans/2026-09-05-operator-conversations-endpoints.md` (different repo).

## Global Constraints

- Fixture-mode gating stays strict-true on `EXPO_PUBLIC_USE_FIXTURES === 'true'` — never invert to a `!EXPO_PUBLIC_API_BASE_URL` check (TAC-270).
- Errors-as-values everywhere: every new `lib/api/*` function returns `{ ok: true, data }` / `{ ok: false, error: ApiError }`. No new `ApiError` kinds.
- Contract-boundary tests (URL, method, body, header) live only in a live-mode block with `fetch` mocked — never in a fixture-mode block, and transcribed from the Contract in the spec, never from the client code.
- No `hover:` NativeWind classes for state-dependent styling — conditional `className`/inline style only.
- `SafeAreaView` always from `react-native-safe-area-context`, never `react-native`.
- Any file touching `app/_layout.tsx` requires flagging an on-device smoke test (cold launch + queue swipe) before merge — done in Task 1 and re-confirmed in Task 13.
- The Conversations thread screen is read-only — no compose box, no send/edit/skip affordance.
- `npm run typecheck` (which regenerates typed routes) must pass after any new file under `app/`.

---

## Task 1: Lift the queue context to the root layout

**Files:**
- Create: `lib/queue-context.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/queue/_layout.tsx`
- Modify: `app/queue/index.tsx:1-20` (import path only)
- Modify: `app/queue/edit.tsx:1-20` (import path only)
- Modify: `hooks/use-queue.ts`
- Modify: `__tests__/screens/queue-index.test.tsx`
- Modify: `__tests__/screens/queue-edit.test.tsx`
- Modify: `__tests__/screens/root-layout.test.tsx`

**Interfaces:**
- Produces: `useQueueContext(): UseQueueResult` and `QueueProvider({ children }): JSX.Element`, both exported from `@/lib/queue-context` — Task 11 imports `useQueueContext` for the tab header, and every existing `/queue` call site switches its import here.

- [ ] **Step 1: Run the existing suite to establish a baseline**

Run: `npm test`
Expected: PASS (full existing suite, before any change).

- [ ] **Step 2: Add an `enabled` option to `useQueue`**

In `hooks/use-queue.ts`, change the signature and gate both the initial fetch and realtime-triggered reloads on it (default `true` so the existing `/queue` call site is unaffected):

```ts
export function useQueue(options?: { enabled?: boolean }): UseQueueResult {
  const enabled = options?.enabled ?? true;
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [status, setStatus] = useState<QueueStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setStatus('loading');
    setError(null);
    const result = await listQueue();
    if (!mounted.current) return;
    if (result.ok) {
      setDrafts(sortByPriority(result.data));
      setStatus('ready');
    } else {
      setError(result.error);
      setStatus('error');
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    if (enabled) void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload, enabled]);

  const onRealtimeEvent = useCallback(
    (_event: QueueChannelEvent): void => {
      if (enabled) void reload();
    },
    [reload, enabled],
  );
  useQueueRealtime(onRealtimeEvent);

  const optimisticallyRemove = useCallback((messageId: string): void => {
    setDrafts((prev) => prev.filter((d) => d.messageId !== messageId));
  }, []);

  const restore = useCallback((draft: PendingDraft): void => {
    setDrafts((prev) => {
      if (prev.some((d) => d.messageId === draft.messageId)) return prev;
      return sortByPriority([...prev, draft]);
    });
  }, []);

  return { drafts, status, error, reload, optimisticallyRemove, restore };
}
```

(`useQueueRealtime` stays unconditional — React's rules of hooks require it, and it already no-ops internally when there's no access token, which is the state before sign-in.)

- [ ] **Step 3: Create `lib/queue-context.tsx`**

```tsx
// lib/queue-context.tsx
// Queue data lives here, not in app/queue/_layout.tsx, so both the /queue
// stack and the new /conversations stack can read the same live queue count
// (the tab header shows it on both screens) without opening a second
// listQueue() fetch or a second realtime subscription.

import { createContext, useContext, type ReactNode } from 'react';

import { type UseQueueResult, useQueue } from '@/hooks/use-queue';
import { useSession } from '@/lib/auth/use-session';

const QueueContext = createContext<UseQueueResult | null>(null);

export function useQueueContext(): UseQueueResult {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error('useQueueContext must be used inside <QueueProvider>');
  }
  return ctx;
}

// `enabled` mirrors the exact pre-lift behavior: the queue only ever fetched
// once an operator was signed in (it used to only mount once expo-router
// entered the auth-gated /queue stack). QueueProvider now always mounts, so
// the gate moves inside instead of relying on conditional mounting.
export function QueueProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const queue = useQueue({ enabled: session.status === 'signed-in' });
  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>;
}
```

- [ ] **Step 4: Wire `QueueProvider` into the root layout**

In `app/_layout.tsx`, add the import and wrap the `<Stack>` + `<Toast />`:

```tsx
import { QueueProvider } from '@/lib/queue-context';
```

```tsx
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <QueueProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={isSignedIn}>
            <Stack.Screen name="index" />
            <Stack.Screen name="queue" />
          </Stack.Protected>
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Screen name="auth/callback" />
        </Stack>
        <Toast />
      </QueueProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);
```

(The `conversations` screen isn't registered here yet — Task 11 adds it together with the route files themselves, so there's never a commit where a Stack.Screen name has no matching route.)

- [ ] **Step 5: Shrink `app/queue/_layout.tsx`**

```tsx
// app/queue/_layout.tsx
import { Stack } from 'expo-router';

export default function QueueLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="edit"
        options={{ presentation: 'modal', animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
```

- [ ] **Step 6: Update the two screens' import path**

In `app/queue/index.tsx`, change:
```ts
import { useQueueContext } from './_layout';
```
to:
```ts
import { useQueueContext } from '@/lib/queue-context';
```

In `app/queue/edit.tsx`, change:
```ts
import { useQueueContext } from './_layout';
```
to:
```ts
import { useQueueContext } from '@/lib/queue-context';
```

- [ ] **Step 7: Update the existing test mocks to the new module path**

In `__tests__/screens/queue-index.test.tsx`, change:
```ts
jest.mock('@/app/queue/_layout', () => ({ useQueueContext: () => mockQueue }));
```
to:
```ts
jest.mock('@/lib/queue-context', () => ({ useQueueContext: () => mockQueue }));
```

In `__tests__/screens/queue-edit.test.tsx`, change:
```ts
jest.mock('@/app/queue/_layout', () => ({
  useQueueContext: () => mockQueue,
}));
```
to:
```ts
jest.mock('@/lib/queue-context', () => ({
  useQueueContext: () => mockQueue,
}));
```

In `__tests__/screens/root-layout.test.tsx`, add a mock so `QueueProvider` doesn't try to run the real `useQueue()` (which would hit real `lib/api/queue` / realtime code this test never set up) — add this alongside the other `jest.mock(...)` calls near the top of the file:

```ts
jest.mock('@/lib/queue-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    QueueProvider: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});
```

- [ ] **Step 8: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — same tests as Step 1, none newly broken.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/queue-context.tsx app/_layout.tsx app/queue/_layout.tsx app/queue/index.tsx app/queue/edit.tsx hooks/use-queue.ts __tests__/screens/queue-index.test.tsx __tests__/screens/queue-edit.test.tsx __tests__/screens/root-layout.test.tsx
git commit -m "lift queue context to the root layout"
```

- [ ] **Step 11 (flag, don't skip):** This touches `app/_layout.tsx`. Per CLAUDE.md, flag that an on-device smoke test (cold launch + queue swipe) is required before this ships — note it for the final verification in Task 13, don't try to run it yourself (Jaipal runs the app on-device).

---

## Task 2: Time-formatting helpers + theme constant

**Files:**
- Create: `lib/conversations-format.ts`
- Test: `__tests__/lib/conversations-format.test.ts`
- Modify: `lib/theme.ts`

**Interfaces:**
- Produces: `minutesSince(iso, nowMs?)`, `formatConversationTime(iso, nowMs?)`, `isConversationActive(iso, windowMins, nowMs?)`, `formatConversationsSince(count, firstConversationAt, nowMs?)` — consumed by Tasks 9, 10, 12.
- Produces: `conversations.activeWindowMins` in `lib/theme.ts` — consumed by Tasks 9, 10, 12.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/conversations-format.test.ts
import {
  formatConversationsSince,
  formatConversationTime,
  isConversationActive,
  minutesSince,
} from '@/lib/conversations-format';

const NOW = Date.parse('2026-09-05T21:41:00.000Z');

describe('minutesSince', () => {
  it('returns elapsed minutes, floored at 0', () => {
    expect(minutesSince('2026-09-05T21:40:00.000Z', NOW)).toBe(1);
    expect(minutesSince('2026-09-05T21:41:30.000Z', NOW)).toBe(0);
  });
});

describe('formatConversationTime', () => {
  it('returns "now" for under a minute', () => {
    expect(formatConversationTime('2026-09-05T21:40:45.000Z', NOW)).toBe('now');
  });

  it('returns compact minutes under an hour', () => {
    expect(formatConversationTime('2026-09-05T21:39:00.000Z', NOW)).toBe('2m');
  });

  it('returns compact hours under a day', () => {
    expect(formatConversationTime('2026-09-05T18:41:00.000Z', NOW)).toBe('3h');
  });

  it('returns compact days beyond a day', () => {
    expect(formatConversationTime('2026-09-02T21:41:00.000Z', NOW)).toBe('3d');
  });
});

describe('isConversationActive', () => {
  it('is active exactly at the window boundary', () => {
    expect(isConversationActive('2026-09-05T20:41:00.000Z', 60, NOW)).toBe(true);
  });

  it('is inactive just past the window', () => {
    expect(isConversationActive('2026-09-05T20:40:00.000Z', 60, NOW)).toBe(false);
  });
});

describe('formatConversationsSince', () => {
  it('returns "first conversation" when count is 1', () => {
    expect(formatConversationsSince(1, '2026-09-05T18:00:00.000Z', NOW)).toBe(
      'first conversation',
    );
  });

  it('returns a month label when the first conversation was this year', () => {
    expect(formatConversationsSince(4, '2026-06-10T18:00:00.000Z', NOW)).toBe(
      '4 conversations since June',
    );
  });

  it('returns a bare year label when the first conversation was a prior year', () => {
    expect(formatConversationsSince(44, '2024-11-08T18:00:00.000Z', NOW)).toBe(
      '44 conversations since 2024',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- conversations-format`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the theme constant**

In `lib/theme.ts`, append:

```ts
// Conversations tab: the window (in minutes since last message) inside
// which a conversation counts as "active" — drives the pulsing-dot render
// and the Active filter pill. Mirrors the imported design's default.
export const conversations = {
  activeWindowMins: 60,
} as const;
```

- [ ] **Step 4: Write the implementation**

```ts
// lib/conversations-format.ts
// Pure time/label formatting for the Conversations tab. All functions take
// an explicit `nowMs` for deterministic testing; callers omit it to use the
// real clock.

export function minutesSince(iso: string, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
}

/** Compact relative time for a conversation-list row: "now" / "2m" / "3h" / "3d". */
export function formatConversationTime(iso: string, nowMs: number = Date.now()): string {
  const mins = minutesSince(iso, nowMs);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function isConversationActive(
  iso: string,
  windowMins: number,
  nowMs: number = Date.now(),
): boolean {
  return minutesSince(iso, nowMs) <= windowMins;
}

/**
 * "first conversation" when there's only ever been one, otherwise
 * "N conversations since {Month}" (this year) or "N conversations since
 * {Year}" (a prior year) — matches the imported design's two label modes.
 */
export function formatConversationsSince(
  count: number,
  firstConversationAt: string,
  nowMs: number = Date.now(),
): string {
  if (count <= 1) return 'first conversation';
  const first = new Date(firstConversationAt);
  const now = new Date(nowMs);
  const label =
    first.getFullYear() === now.getFullYear()
      ? new Intl.DateTimeFormat('en-US', { month: 'long' }).format(first)
      : String(first.getFullYear());
  return `${count} conversations since ${label}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- conversations-format`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/conversations-format.ts __tests__/lib/conversations-format.test.ts lib/theme.ts
git commit -m "add conversation time-formatting helpers"
```

---

## Task 3: `lib/fixtures/conversations.ts`

**Files:**
- Create: `lib/fixtures/conversations.ts`
- Test: `__tests__/lib/fixtures-conversations.test.ts`

**Interfaces:**
- Consumes: `fixtureUuid` from `@/lib/fixtures/queue` (existing export).
- Produces: `listConversationsFixture(): ConversationSummary[]`, `getGuestThreadFixture(guestId: string): ThreadMessage[]`, `subscribeConversationsFixture(fn): () => void`, `triggerConversationActivityFixture(guestId: string, body: string): void`, `resetConversationsFixture(): void` — Task 4 (`lib/api/conversations.ts`) and Task 5 (`lib/realtime/conversations-channel.ts`) both import from here. `ConversationSummary` / `ThreadMessage` types come from `@/lib/api/conversations` and `@/lib/api/queue` respectively — this file is written against those shapes even though Task 4 (which defines `ConversationSummary`) comes after it; write the type inline here for now and Task 4 will confirm it matches (both are transcribed from the same spec Contract, so they will).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/fixtures-conversations.test.ts
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
  it('seeds 12 conversations', () => {
    expect(listConversationsFixture()).toHaveLength(12);
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

  it('resetConversationsFixture restores the original 12-guest seed', () => {
    const [target] = listConversationsFixture();
    triggerConversationActivityFixture(target.guestId, 'a new message');
    resetConversationsFixture();
    expect(listConversationsFixture()).toHaveLength(12);
    expect(getGuestThreadFixture(target.guestId).at(-1)?.body).not.toBe('a new message');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fixtures-conversations`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/fixtures/conversations.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fixtures-conversations`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/fixtures/conversations.ts __tests__/lib/fixtures-conversations.test.ts
git commit -m "add conversations fixture data"
```

---

## Task 4: `lib/api/conversations.ts`

**Files:**
- Create: `lib/api/conversations.ts`
- Test: `__tests__/lib/api-conversations.test.ts`

**Interfaces:**
- Consumes: `authedFetch`, `parseHttpError` from `./client`; `isFixtureMode`, `ThreadMessage`, `ThreadMessageSchema`, `RecognitionStateSchema` from `./queue`; fixture functions from `@/lib/fixtures/conversations`.
- Produces: `ConversationSummarySchema`, `type ConversationSummary`, `listConversations(): Promise<Result<ConversationSummary[]>>`, `getGuestThread(guestId: string): Promise<Result<ThreadMessage[]>>` — Task 5's hook and Tasks 9/12's screens import from here.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/api-conversations.test.ts
import * as fixtures from '@/lib/fixtures/conversations';
import { getGuestThread, listConversations } from '@/lib/api/conversations';

const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;
const ORIGINAL_API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

afterAll(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_API_BASE;
});

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
  fixtures.resetConversationsFixture();
});

describe('lib/api/conversations in fixture mode', () => {
  it('listConversations returns the 12-guest fixture seed', async () => {
    const result = await listConversations();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(12);
  });

  it('getGuestThread returns that guest\'s messages', async () => {
    const list = (await listConversations()) as { ok: true; data: { guestId: string }[] };
    const target = list.data[0].guestId;
    const result = await getGuestThread(target);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.length).toBeGreaterThan(0);
  });

  it('getGuestThread returns [] for an unknown guestId', async () => {
    const result = await getGuestThread('00000000-0000-4000-8000-000000000000');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });
});

describe('lib/api/conversations HTTP shape', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    fetchMock = jest.fn().mockResolvedValue(new Response('', { status: 200 }));
    global.fetch = fetchMock as any;
    jest
      .spyOn(require('@/lib/supabase/client').supabase.auth, 'getSession')
      .mockResolvedValue({ data: { session: { access_token: 't' } as any } } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Transcribed from the Contract in
  // docs/superpowers/specs/2026-09-05-conversations-tab-design.md — not from
  // whatever this file happens to send. Per the repo's contract-boundary
  // testing rule (see CLAUDE.md, TAC-310 postmortem).
  it('listConversations GETs /api/operator/conversations and unwraps the { conversations } envelope', async () => {
    const row = {
      guestId: 'c0111111-1111-4111-8111-111111111111',
      venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      venueSlug: 'mock-sextant-coffee-roasters',
      venueTimezone: 'America/Los_Angeles',
      agentName: 'Sana',
      name: 'Maya R.',
      phoneFallback: '+15551110001',
      recognitionState: 'returning',
      lastMessageAt: '2026-09-05T21:39:00.000Z',
      lastMessageDirection: 'outbound',
      lastMessagePreview: 'Done — got you down for two at 7:30.',
      conversationCount: 4,
      firstConversationAt: '2026-06-10T18:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ conversations: [row] }), { status: 200 }),
    );
    const result = await listConversations();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.test/api/operator/conversations');
    expect(init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([row]);
  });

  it('getGuestThread GETs /api/operator/guests/:guestId/thread and unwraps { messages }', async () => {
    const guestId = 'c0111111-1111-4111-8111-111111111111';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              direction: 'inbound',
              body: 'hey!',
              createdAt: '2026-09-05T18:00:00.000Z',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await getGuestThread(guestId);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://api.test/api/operator/guests/${guestId}/thread`);
    expect(init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        {
          id: '11111111-1111-1111-1111-111111111111',
          direction: 'inbound',
          body: 'hey!',
          createdAt: '2026-09-05T18:00:00.000Z',
        },
      ]);
    }
  });

  it('listConversations returns a PARSE error on a malformed response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ conversations: [{ guestId: 'not-a-uuid' }] }), {
        status: 200,
      }),
    );
    const result = await listConversations();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api-conversations`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/api/conversations.ts
import { z } from 'zod';

import * as fixtures from '@/lib/fixtures/conversations';

import { authedFetch, parseHttpError } from './client';
import { type ApiError, type Result, err, ok } from './errors';
import { RecognitionStateSchema, ThreadMessageSchema, isFixtureMode, type ThreadMessage } from './queue';

// Not `.strict()` — same reasoning as ThreadMessageSchema/RecentContextEntrySchema:
// additive server fields must not break every pre-update client on every fetch.
export const ConversationSummarySchema = z.object({
  guestId: z.string().uuid(),
  venueId: z.string().uuid(),
  venueSlug: z.string(),
  venueTimezone: z.string().nullable(),
  agentName: z.string(),
  name: z.string().nullable(),
  phoneFallback: z.string(),
  recognitionState: RecognitionStateSchema.nullable(),
  lastMessageAt: z.string(),
  lastMessageDirection: z.enum(['inbound', 'outbound']),
  lastMessagePreview: z.string(),
  conversationCount: z.number(),
  firstConversationAt: z.string(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// GET /api/operator/conversations returns { conversations: [...] } per the
// Contract in docs/superpowers/specs/2026-09-05-conversations-tab-design.md.
const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSummarySchema),
});

// GET /api/operator/guests/:guestId/thread returns { messages: [...] } —
// identical envelope shape to the existing per-message thread endpoint.
const GetGuestThreadResponseSchema = z.object({
  messages: z.array(ThreadMessageSchema),
});

function parseFailure(reason: string): { ok: false; error: ApiError } {
  return err<ApiError>({ kind: 'PARSE', message: reason });
}

export async function listConversations(): Promise<Result<ConversationSummary[]>> {
  if (isFixtureMode()) {
    return ok(fixtures.listConversationsFixture());
  }
  const result = await authedFetch('/api/operator/conversations', { method: 'GET' });
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  let json: unknown;
  try {
    json = await result.data.json();
  } catch (e) {
    return parseFailure(e instanceof Error ? e.message : 'invalid json');
  }
  const parsed = ListConversationsResponseSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data.conversations);
}

export async function getGuestThread(guestId: string): Promise<Result<ThreadMessage[]>> {
  if (isFixtureMode()) {
    return ok(fixtures.getGuestThreadFixture(guestId));
  }
  const result = await authedFetch(
    `/api/operator/guests/${encodeURIComponent(guestId)}/thread`,
    { method: 'GET' },
  );
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  let json: unknown;
  try {
    json = await result.data.json();
  } catch (e) {
    return parseFailure(e instanceof Error ? e.message : 'invalid json');
  }
  const parsed = GetGuestThreadResponseSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data.messages);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- api-conversations`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/api/conversations.ts __tests__/lib/api-conversations.test.ts
git commit -m "add lib/api/conversations"
```

---

## Task 5: Realtime channel + hooks

**Files:**
- Create: `lib/realtime/conversations-channel.ts`
- Create: `hooks/use-conversations-realtime.ts`
- Create: `hooks/use-conversations.ts`
- Test: `__tests__/lib/realtime-conversations-channel.test.ts`
- Test: `hooks/use-conversations.test.ts` (documented stub — see Step 5's note)

**Interfaces:**
- Consumes: `isFixtureMode` from `@/lib/api/queue`; `subscribeConversationsFixture` from `@/lib/fixtures/conversations`; `supabase` from `@/lib/supabase/client`; `getOperator`, `fetchOperatorVenueIds` from `@/lib/auth/operator`; `useSession` from `@/lib/auth/use-session`; `listConversations`, `type ConversationSummary` from `@/lib/api/conversations`.
- Produces: `type ConversationsChannelEvent`, `createConversationsChannel(opts)` from the channel module; `useConversationsRealtime(onEvent)` from the realtime hook; `type UseConversationsResult`, `useConversations(): UseConversationsResult` — Task 11's list screen imports `useConversations`.

- [ ] **Step 1: Write the failing test for the channel**

```ts
// __tests__/lib/realtime-conversations-channel.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- realtime-conversations-channel`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/realtime/conversations-channel.ts`**

```ts
// lib/realtime/conversations-channel.ts
// Mirrors lib/realtime/queue-channel.ts, but with no direction post-filter —
// the Conversations tab cares about ANY message activity (inbound or
// outbound), unlike the queue channel which only reloads on outbound
// review-state-relevant changes.

import type { RealtimeChannel } from '@supabase/supabase-js';

import { isFixtureMode } from '@/lib/api/queue';
import { subscribeConversationsFixture } from '@/lib/fixtures/conversations';
import { supabase } from '@/lib/supabase/client';

export type ConversationsChannelEvent = { type: 'conversations_changed' };

export type ConversationsChannel = {
  unsubscribe: () => void;
};

export type ConversationsChannelOptions = {
  operatorId: string;
  venueIds: string[];
  accessToken: string;
  onEvent: (event: ConversationsChannelEvent) => void;
  onReconnect?: () => void;
};

export function createConversationsChannel(
  opts: ConversationsChannelOptions,
): ConversationsChannel {
  if (isFixtureMode()) {
    const unsub = subscribeConversationsFixture(opts.onEvent);
    return { unsubscribe: unsub };
  }

  if (opts.venueIds.length === 0) {
    return { unsubscribe: () => undefined };
  }

  supabase.realtime.setAuth(opts.accessToken);

  const venueFilter = `venue_id=in.(${opts.venueIds.join(',')})`;
  let lastStatus: string | null = null;

  const handle = (): void => {
    opts.onEvent({ type: 'conversations_changed' });
  };

  const channel: RealtimeChannel = supabase
    .channel(`operator-conversations-${opts.operatorId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: venueFilter },
      handle,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: venueFilter },
      handle,
    )
    .subscribe((status) => {
      const reconnected =
        (lastStatus === 'CHANNEL_ERROR' ||
          lastStatus === 'TIMED_OUT' ||
          lastStatus === 'CLOSED') &&
        status === 'SUBSCRIBED';
      lastStatus = status;
      if (reconnected) opts.onReconnect?.();
    });

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- realtime-conversations-channel`
Expected: PASS (1 test)

- [ ] **Step 5: Write `hooks/use-conversations-realtime.ts` and `hooks/use-conversations.ts`**

`hooks/use-conversations.ts`'s own unit-test coverage is intentionally thin — mirroring the existing `hooks/use-queue.test.ts`, which is a documented stub because there's nothing meaningful to unit-test at the hook level once every realtime event just triggers a reload (the raw `messages` row doesn't carry the joined summary fields, so per-event merging isn't feasible here either). Behavior is exercised through the Task 11 screen test instead.

```ts
// hooks/use-conversations-realtime.ts
import { useEffect } from 'react';

import { fetchOperatorVenueIds, getOperator } from '@/lib/auth/operator';
import { useSession } from '@/lib/auth/use-session';
import {
  type ConversationsChannelEvent,
  createConversationsChannel,
} from '@/lib/realtime/conversations-channel';

export function useConversationsRealtime(
  onEvent: (event: ConversationsChannelEvent) => void,
): void {
  const session = useSession();
  const accessToken = session.session?.access_token ?? null;

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const operatorResult = await getOperator();
      if (cancelled || !operatorResult.ok) return;

      const venuesResult = await fetchOperatorVenueIds(operatorResult.operator.id);
      if (cancelled || !venuesResult.ok) return;

      const channel = createConversationsChannel({
        operatorId: operatorResult.operator.id,
        venueIds: venuesResult.venueIds,
        accessToken,
        onEvent,
        onReconnect: () => onEvent({ type: 'conversations_changed' }),
      });

      if (cancelled) {
        channel.unsubscribe();
        return;
      }
      unsubscribe = channel.unsubscribe;
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [accessToken, onEvent]);
}
```

```ts
// hooks/use-conversations.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useConversationsRealtime } from '@/hooks/use-conversations-realtime';
import { type ConversationSummary, listConversations } from '@/lib/api/conversations';
import { type ApiError } from '@/lib/api/errors';
import { type ConversationsChannelEvent } from '@/lib/realtime/conversations-channel';

export type ConversationsStatus = 'loading' | 'ready' | 'error';

export type UseConversationsResult = {
  conversations: ConversationSummary[];
  status: ConversationsStatus;
  error: ApiError | null;
  reload: () => Promise<void>;
};

// Newest activity first — smallest "mins since last message" sorts first,
// which is equivalent to sorting lastMessageAt descending.
function sortByRecency(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [status, setStatus] = useState<ConversationsStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    setStatus('loading');
    setError(null);
    const result = await listConversations();
    if (!mounted.current) return;
    if (result.ok) {
      setConversations(sortByRecency(result.data));
      setStatus('ready');
    } else {
      setError(result.error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  const onRealtimeEvent = useCallback(
    (_event: ConversationsChannelEvent): void => {
      void reload();
    },
    [reload],
  );
  useConversationsRealtime(onRealtimeEvent);

  return { conversations, status, error, reload };
}
```

```ts
// hooks/use-conversations.test.ts
// Mirrors hooks/use-queue.test.ts: every realtime event just triggers a
// reload (the raw `messages` row doesn't carry the joined summary fields
// needed for per-event merging), so there's nothing meaningful to
// unit-test at the hook level in isolation. Reload-on-event and the
// initial-fetch behavior are exercised end-to-end through the Task 11
// conversations-list screen test.
describe('use-conversations', () => {
  it('has no hook-level merge tests, same reasoning as use-queue', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/realtime/conversations-channel.ts hooks/use-conversations-realtime.ts hooks/use-conversations.ts __tests__/lib/realtime-conversations-channel.test.ts hooks/use-conversations.test.ts
git commit -m "add conversations realtime channel and hooks"
```

---

## Task 6: Shared tab header, replacing `QueueHeader`

**Files:**
- Create: `components/shell/queue-tabs-header.tsx`
- Test: `__tests__/components/shell/queue-tabs-header.test.tsx`
- Delete: `components/queue/queue-header.tsx`
- Delete: `__tests__/components/queue/queue-header.test.tsx`
- Modify: `app/queue/index.tsx`
- Modify: `__tests__/screens/queue-index.test.tsx`

**Interfaces:**
- Consumes: `useQueueContext` from `@/lib/queue-context` (Task 1).
- Produces: `QueueTabsHeader({ onMenuPress }): JSX.Element` — Task 11's conversations screen also uses this.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/shell/queue-tabs-header.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { QueueTabsHeader } from '@/components/shell/queue-tabs-header';
import { type UseQueueResult } from '@/hooks/use-queue';

let mockPathname = '/queue';
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

const mockQueue: UseQueueResult = {
  drafts: [{ messageId: '1' } as any, { messageId: '2' } as any],
  status: 'ready',
  error: null,
  reload: jest.fn(),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
};
jest.mock('@/lib/queue-context', () => ({ useQueueContext: () => mockQueue }));

beforeEach(() => {
  mockPathname = '/queue';
  mockReplace.mockClear();
});

describe('QueueTabsHeader', () => {
  it('renders the logo and menu button', () => {
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    expect(screen.getByLabelText('Analog')).toBeTruthy();
    expect(screen.getByLabelText('Open menu')).toBeTruthy();
  });

  it('fires onMenuPress when the menu button is pressed', () => {
    const onMenuPress = jest.fn();
    render(<QueueTabsHeader onMenuPress={onMenuPress} />);
    fireEvent.press(screen.getByLabelText('Open menu'));
    expect(onMenuPress).toHaveBeenCalledTimes(1);
  });

  it('shows the live queue count on the Queue tab', () => {
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('navigates to /conversations when that tab is pressed', () => {
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    fireEvent.press(screen.getByLabelText('Conversations'));
    expect(mockReplace).toHaveBeenCalledWith('/conversations');
  });

  it('navigates to /queue when that tab is pressed from elsewhere', () => {
    mockPathname = '/conversations';
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    fireEvent.press(screen.getByLabelText('Queue'));
    expect(mockReplace).toHaveBeenCalledWith('/queue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- queue-tabs-header`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// components/shell/queue-tabs-header.tsx
// Replaces the bare QueueHeader on both /queue and /conversations: same
// hamburger + logo row, plus the segmented Queue/Conversations switcher
// from the imported design. Switches tabs via router.replace (not push) so
// tab-switching never grows the back stack.

import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { useQueueContext } from '@/lib/queue-context';

const LOGO = require('../../assets/images/logo.png');

type Props = {
  onMenuPress: () => void;
};

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ paddingBottom: 10 }}
    >
      <Text
        className={active ? 'font-inter-tight-medium text-ink' : 'font-inter-tight-medium text-ink-faint'}
        style={{ fontSize: 13 }}
      >
        {label}
      </Text>
      {active ? (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: '#C66A4A',
          }}
        />
      ) : null}
    </Pressable>
  );
}

export function QueueTabsHeader({ onMenuPress }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const queue = useQueueContext();
  const onQueue = pathname.startsWith('/queue');
  const onConversations = pathname.startsWith('/conversations');

  return (
    <View>
      <View className="flex-row items-center justify-between px-[22px] pb-2 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={onMenuPress}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="menu" size={22} color="#1C1814" />
        </Pressable>
        <Image
          source={LOGO}
          accessibilityLabel="Analog"
          resizeMode="contain"
          style={{ width: 34, height: 34 }}
        />
        <View style={{ width: 22 }} />
      </View>
      <View
        className="flex-row border-b-[0.5px] border-hairline-soft px-[22px]"
        style={{ gap: 26, paddingTop: 6 }}
      >
        <Tab label={`Queue ${queue.drafts.length}`} active={onQueue} onPress={() => router.replace('/queue')} />
        <Tab label="Conversations" active={onConversations} onPress={() => router.replace('/conversations')} />
      </View>
    </View>
  );
}
```

Note: the label passed to `Tab` for the Queue tab is `"Queue 2"` (a single accessibility label), not a separate count element — this reads correctly to a screen reader as one phrase and keeps `Tab` a single reusable component for both tabs. If a visually distinct, smaller count digit is wanted later (the mockup renders it in a slightly smaller size), that's a follow-up styling pass, not a behavior change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- queue-tabs-header`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire it into the Queue screen and delete the superseded header**

In `app/queue/index.tsx`, replace:
```ts
import { QueueHeader } from '@/components/queue/queue-header';
```
with:
```ts
import { QueueTabsHeader } from '@/components/shell/queue-tabs-header';
```
and replace the JSX usage:
```tsx
<QueueHeader onMenuPress={() => setMenuOpen(true)} />
```
with:
```tsx
<QueueTabsHeader onMenuPress={() => setMenuOpen(true)} />
```

Delete the now-unused files:
```bash
git rm components/queue/queue-header.tsx __tests__/components/queue/queue-header.test.tsx
```

- [ ] **Step 6: Update `queue-index.test.tsx`'s `expo-router` mock**

The screen (via `QueueTabsHeader`) now calls `usePathname()`, which the existing mock doesn't provide. Change:
```ts
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
```
to:
```ts
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/queue',
}));
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions in `queue-index.test.tsx` or elsewhere.

- [ ] **Step 8: Commit**

```bash
git add components/shell/queue-tabs-header.tsx __tests__/components/shell/queue-tabs-header.test.tsx app/queue/index.tsx __tests__/screens/queue-index.test.tsx
git commit -m "add shared QueueTabsHeader, replace QueueHeader"
```

---

## Task 7: Extract `ThreadBubbleList`, shared by the edit screen and the new thread screen

**Files:**
- Create: `components/thread/thread-bubble-list.tsx`
- Test: `__tests__/components/thread/thread-bubble-list.test.tsx`
- Modify: `app/queue/edit.tsx`

**Interfaces:**
- Consumes: `type ThreadItem` from `@/lib/thread-cluster`.
- Produces: `ThreadBubbleList({ items }): JSX.Element` — Task 12's thread screen also uses this.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/thread/thread-bubble-list.test.tsx
import { render, screen } from '@testing-library/react-native';

import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { type ThreadItem } from '@/lib/thread-cluster';

const ITEMS: ThreadItem[] = [
  { kind: 'timestamp', key: 'ts-1', label: 'Fri Sep 5 · evening' },
  {
    kind: 'bubble',
    key: 'b-1',
    position: 'only',
    message: { id: '1', direction: 'inbound', body: 'hey there', createdAt: '2026-09-05T20:00:00.000Z' },
  },
  {
    kind: 'bubble',
    key: 'b-2',
    position: 'only',
    message: { id: '2', direction: 'outbound', body: 'hi!', createdAt: '2026-09-05T20:01:00.000Z' },
  },
];

describe('ThreadBubbleList', () => {
  it('renders the timestamp label', () => {
    render(<ThreadBubbleList items={ITEMS} />);
    expect(screen.getByText('Fri Sep 5 · evening')).toBeTruthy();
  });

  it('renders both bubble bodies', () => {
    render(<ThreadBubbleList items={ITEMS} />);
    expect(screen.getByText('hey there')).toBeTruthy();
    expect(screen.getByText('hi!')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- thread-bubble-list`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Move the existing bubble-rendering JSX out of `app/queue/edit.tsx` (the `{items.map((item) => { ... })}` block inside its `<ScrollView>`) into a new component with identical output:

```tsx
// components/thread/thread-bubble-list.tsx
import { Fragment } from 'react';
import { Text, View } from 'react-native';

import { type ThreadItem } from '@/lib/thread-cluster';

type Props = {
  items: ThreadItem[];
};

export function ThreadBubbleList({ items }: Props) {
  return (
    <>
      {items.map((item) => {
        if (item.kind === 'timestamp') {
          return (
            <View key={item.key} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text
                className="font-inter-tight uppercase text-ink-faint"
                style={{ fontSize: 10, letterSpacing: 1.5 }}
              >
                {item.label}
              </Text>
            </View>
          );
        }
        const { message: m, position } = item;
        const hasTail = position === 'only' || position === 'last';
        const inbound = m.direction === 'inbound';
        return (
          <View
            key={item.key}
            className={
              inbound
                ? 'self-start rounded-[18px] bg-inbound'
                : 'self-end rounded-[18px] border-[0.5px] border-hairline bg-paper'
            }
            style={{
              maxWidth: '80%',
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginTop: position === 'first' || position === 'only' ? 4 : 0,
              borderBottomLeftRadius: inbound && hasTail ? 6 : 18,
              borderBottomRightRadius: !inbound && hasTail ? 6 : 18,
            }}
          >
            <Text
              className="font-inter-tight"
              style={{
                color: inbound ? '#F0EDE7' : '#1C1814',
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {m.body}
            </Text>
          </View>
        );
      })}
    </>
  );
}
```

(`Fragment` import is unused if you write `<>...</>` — drop the explicit import; it's shown here only to make clear no wrapping `View` is introduced, since this renders directly inside the edit screen's `ScrollView`.)

In `app/queue/edit.tsx`, add the import:
```ts
import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
```
and replace the entire `{items.map((item) => { ... })}` block inside the `<ScrollView>` with:
```tsx
<ThreadBubbleList items={items} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- thread-bubble-list`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite to confirm the edit screen still renders correctly**

Run: `npm test -- queue-edit`
Expected: PASS — no regression in `__tests__/screens/queue-edit.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/thread/thread-bubble-list.tsx __tests__/components/thread/thread-bubble-list.test.tsx app/queue/edit.tsx
git commit -m "extract ThreadBubbleList from the edit screen"
```

---

## Task 8: `EmptyState` variant prop

**Files:**
- Modify: `components/queue/empty-state.tsx`
- Modify: `__tests__/components/queue/empty-state.test.tsx`

**Interfaces:**
- Produces: `EmptyState({ variant?: 'queue' | 'conversations' })` — Task 11's list screen passes `variant="conversations"`.

- [ ] **Step 1: Write the failing test (add to the existing file)**

Add to `__tests__/components/queue/empty-state.test.tsx`:

```tsx
it('renders the conversations-tab copy when variant is "conversations"', () => {
  render(<EmptyState variant="conversations" />);
  expect(screen.getByText('Nothing here right now.')).toBeTruthy();
  expect(
    screen.getByText("No conversations match that filter. Loosen it and they'll come back."),
  ).toBeTruthy();
});

it('still renders the default queue copy when no variant is passed', () => {
  render(<EmptyState />);
  expect(screen.getByText('You’re all caught up.')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- empty-state`
Expected: FAIL — the new assertions don't match current output (component ignores `variant`).

- [ ] **Step 3: Write the implementation**

```tsx
// components/queue/empty-state.tsx
import { Text, View } from 'react-native';

type Props = {
  variant?: 'queue' | 'conversations';
};

const COPY = {
  queue: {
    headline: 'You’re all caught up.',
    body: 'Nothing pending review. Guests are being handled. Take a breath.',
  },
  conversations: {
    headline: 'Nothing here right now.',
    body: "No conversations match that filter. Loosen it and they'll come back.",
  },
} as const;

export function EmptyState({ variant = 'queue' }: Props) {
  const copy = COPY[variant];
  return (
    <View className="flex-1 items-center px-8" style={{ paddingTop: 80, gap: 14 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#C66A4A',
          marginBottom: 8,
        }}
      />
      <Text
        className="font-fraunces text-ink"
        style={{ fontSize: 32, lineHeight: 36, textAlign: 'center' }}
      >
        {copy.headline}
      </Text>
      <Text
        className="font-inter-tight text-ink-faint"
        style={{ fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 240 }}
      >
        {copy.body}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- empty-state`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add components/queue/empty-state.tsx __tests__/components/queue/empty-state.test.tsx
git commit -m "add conversations variant to EmptyState"
```

---

## Task 9: `ConversationRow`

**Files:**
- Create: `components/conversations/conversation-row.tsx`
- Test: `__tests__/components/conversations/conversation-row.test.tsx`

**Interfaces:**
- Consumes: `RecognitionBadge` from `@/components/queue/recognition-badge`; `formatConversationTime`, `isConversationActive` from `@/lib/conversations-format`; `conversations` theme namespace from `@/lib/theme`; `type ConversationSummary` from `@/lib/api/conversations`.
- Produces: `ConversationRow({ conversation, onPress, isFirst }): JSX.Element` — Task 11's list screen renders one per row.

Note on scope: the imported design animates the active-state dot with a CSS pulse. This plan renders a solid clay dot when active and a hollow hairline-outline dot when not — the same information, no animation. Adding the pulse is a follow-up polish pass (Reanimated), not required for the tab to work correctly.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/conversations/conversation-row.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConversationRow } from '@/components/conversations/conversation-row';
import { type ConversationSummary } from '@/lib/api/conversations';

const BASE: ConversationSummary = {
  guestId: 'g1',
  venueId: 'v1',
  venueSlug: 'mock-sextant',
  venueTimezone: 'America/Los_Angeles',
  agentName: 'Sana',
  name: 'Maya R.',
  phoneFallback: '+15551110001',
  recognitionState: 'returning',
  lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Done — got you down for two at 7:30.',
  conversationCount: 4,
  firstConversationAt: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString(),
};

describe('ConversationRow', () => {
  it('renders the guest name, badge label, and preview', () => {
    render(<ConversationRow conversation={BASE} onPress={() => {}} isFirst />);
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Returning')).toBeTruthy();
    expect(screen.getByText(/Done — got you down for two at 7:30\./)).toBeTruthy();
  });

  it('falls back to the phone number when name is null', () => {
    render(<ConversationRow conversation={{ ...BASE, name: null }} onPress={() => {}} isFirst />);
    expect(screen.getByText('+15551110001')).toBeTruthy();
  });

  it('labels the speaker as the agent name for an outbound last message', () => {
    render(<ConversationRow conversation={BASE} onPress={() => {}} isFirst />);
    expect(screen.getByText(/Sana ·/)).toBeTruthy();
  });

  it('labels the speaker as "Guest" for an inbound last message', () => {
    render(
      <ConversationRow
        conversation={{ ...BASE, lastMessageDirection: 'inbound', lastMessagePreview: 'hi!' }}
        onPress={() => {}}
        isFirst
      />,
    );
    expect(screen.getByText(/Guest ·/)).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<ConversationRow conversation={BASE} onPress={onPress} isFirst />);
    fireEvent.press(screen.getByLabelText('Open conversation with Maya R.'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- conversation-row`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// components/conversations/conversation-row.tsx
import { Pressable, Text, View } from 'react-native';

import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { type ConversationSummary } from '@/lib/api/conversations';
import { formatConversationTime, isConversationActive } from '@/lib/conversations-format';
import { conversations as conversationsTheme } from '@/lib/theme';

type Props = {
  conversation: ConversationSummary;
  onPress: () => void;
  isFirst: boolean;
};

export function ConversationRow({ conversation, onPress, isFirst }: Props) {
  const active = isConversationActive(
    conversation.lastMessageAt,
    conversationsTheme.activeWindowMins,
  );
  const speaker =
    conversation.lastMessageDirection === 'inbound' ? 'Guest' : conversation.agentName;
  const displayName = conversation.name ?? conversation.phoneFallback;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${displayName}`}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 6,
        borderTopWidth: isFirst ? 0 : 0.5,
        borderTopColor: 'rgba(28, 24, 20, 0.06)',
        opacity: pressed ? 0.7 : active ? 1 : 0.62,
      })}
    >
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 6,
            backgroundColor: active ? '#C66A4A' : 'transparent',
            borderWidth: active ? 0 : 1,
            borderColor: 'rgba(28, 24, 20, 0.2)',
          }}
        />
        <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 15 }}>
          {displayName}
        </Text>
        <RecognitionBadge state={conversation.recognitionState} />
        <Text
          className="ml-auto font-inter-tight text-ink-faint"
          style={{ fontSize: 11, letterSpacing: 0.44 }}
        >
          {formatConversationTime(conversation.lastMessageAt)}
        </Text>
      </View>
      <Text
        className="font-inter-tight text-ink-soft"
        numberOfLines={1}
        style={{ fontSize: 13, lineHeight: 19 }}
      >
        <Text className="text-ink-faint">{speaker} · </Text>
        {conversation.lastMessagePreview}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- conversation-row`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/conversations/conversation-row.tsx __tests__/components/conversations/conversation-row.test.tsx
git commit -m "add ConversationRow"
```

---

## Task 10: `TypeFilterMenu`

**Files:**
- Create: `components/conversations/type-filter-menu.tsx`
- Test: `__tests__/components/conversations/type-filter-menu.test.tsx`

**Interfaces:**
- Consumes: `type RecognitionState` from `@/lib/api/queue`; `recognition` theme namespace from `@/lib/theme`.
- Produces: `type TypeFilterOption`, `TypeFilterMenu({ visible, selected, counts, onSelect, onDismiss }): JSX.Element | null` — Task 11's list screen renders this anchored under the filter pill.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/conversations/type-filter-menu.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TypeFilterMenu, type TypeFilterOption } from '@/components/conversations/type-filter-menu';

const COUNTS: Record<TypeFilterOption, number> = {
  all: 12,
  new: 4,
  returning: 3,
  regular: 3,
  raving_fan: 2,
};

describe('TypeFilterMenu', () => {
  it('renders nothing when not visible', () => {
    const { toJSON } = render(
      <TypeFilterMenu
        visible={false}
        selected="all"
        counts={COUNTS}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders every option with its count', () => {
    render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('All guests')).toBeTruthy();
    expect(screen.getByText('Raving Fan')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('fires onSelect with the tapped option\'s key', () => {
    const onSelect = jest.fn();
    render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        onSelect={onSelect}
        onDismiss={() => {}}
      />,
    );
    fireEvent.press(screen.getByLabelText('Regular'));
    expect(onSelect).toHaveBeenCalledWith('regular');
  });

  it('fires onDismiss when the backdrop is pressed', () => {
    const onDismiss = jest.fn();
    render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        onSelect={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(screen.getByLabelText('Dismiss filter menu'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- type-filter-menu`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// components/conversations/type-filter-menu.tsx
// Anchored dropdown, not a Modal — RN's Modal always covers the full
// window and doesn't support anchoring under a specific pill the way this
// needs to. The backdrop Pressable fills its immediate parent (the screen's
// outer flex:1 container — see app/conversations/index.tsx), which is how
// RN's default `position: relative` on every View makes an
// `inset:0`-style absolute child cover the whole screen without a Modal.

import { Pressable, Text, View } from 'react-native';

import { type RecognitionState } from '@/lib/api/queue';
import { recognition } from '@/lib/theme';

export type TypeFilterOption = 'all' | RecognitionState;

type Props = {
  visible: boolean;
  selected: TypeFilterOption;
  counts: Record<TypeFilterOption, number>;
  onSelect: (option: TypeFilterOption) => void;
  onDismiss: () => void;
};

const OPTIONS: { key: TypeFilterOption; label: string }[] = [
  { key: 'all', label: 'All guests' },
  { key: 'new', label: recognition.stateLabels.new },
  { key: 'returning', label: recognition.stateLabels.returning },
  { key: 'regular', label: recognition.stateLabels.regular },
  { key: 'raving_fan', label: recognition.stateLabels.raving_fan },
];

export function TypeFilterMenu({ visible, selected, counts, onSelect, onDismiss }: Props) {
  if (!visible) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss filter menu"
        onPress={onDismiss}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        className="rounded-[12px] border-[0.5px] border-hairline bg-white"
        style={{
          position: 'absolute',
          top: 38,
          left: 96,
          minWidth: 172,
          padding: 5,
          shadowColor: '#1C1814',
          shadowOpacity: 0.16,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 28,
          elevation: 8,
          zIndex: 5,
        }}
      >
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.key;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              onPress={() => onSelect(opt.key)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingHorizontal: 10,
                paddingVertical: 9,
                borderRadius: 8,
                backgroundColor: pressed || isSelected ? 'rgba(28, 24, 20, 0.06)' : 'transparent',
              })}
            >
              <Text
                className={
                  isSelected ? 'font-inter-tight-medium text-ink' : 'font-inter-tight text-ink'
                }
                style={{ fontSize: 13, flex: 1 }}
              >
                {opt.label}
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 11 }}>
                {counts[opt.key]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- type-filter-menu`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add components/conversations/type-filter-menu.tsx __tests__/components/conversations/type-filter-menu.test.tsx
git commit -m "add TypeFilterMenu"
```

---

## Task 11: Conversations list screen + route registration

**Files:**
- Create: `app/conversations/_layout.tsx`
- Create: `app/conversations/index.tsx`
- Modify: `app/_layout.tsx`
- Test: `__tests__/screens/conversations-index.test.tsx`

**Interfaces:**
- Consumes: `useConversations` (Task 5), `QueueTabsHeader` (Task 6), `ConversationRow` (Task 9), `TypeFilterMenu` + `type TypeFilterOption` (Task 10), `EmptyState` (Task 8), `formatConversationTime`/`isConversationActive` (Task 2), `HamburgerMenu` (existing), `conversations` theme namespace (Task 2).

This is the task that registers the route with the auth-gated Stack, so the new screen and its guard land in the same commit — never a state where `app/conversations/` exists but isn't gated, or vice versa.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/screens/conversations-index.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import ConversationsScreen from '@/app/conversations/index';
import { type UseConversationsResult } from '@/hooks/use-conversations';
import { type ConversationSummary } from '@/lib/api/conversations';

const ACTIVE: ConversationSummary = {
  guestId: 'g1',
  venueId: 'v1',
  venueSlug: 'mock-sextant',
  venueTimezone: 'America/Los_Angeles',
  agentName: 'Sana',
  name: 'Maya R.',
  phoneFallback: '+15551110001',
  recognitionState: 'returning',
  lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Done — got you down for two at 7:30.',
  conversationCount: 4,
  firstConversationAt: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString(),
};

const QUIET_NEW: ConversationSummary = {
  ...ACTIVE,
  guestId: 'g2',
  name: 'Ben A.',
  phoneFallback: '+15551110033',
  recognitionState: 'new',
  lastMessageAt: new Date(Date.now() - 2900 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Dogs are very welcome on the patio.',
  conversationCount: 1,
};

let mockConversations: UseConversationsResult = {
  conversations: [ACTIVE, QUIET_NEW],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
};

// `replace` is included even though this file's own tests don't press the
// header's tab buttons — QueueTabsHeader (rendered by this screen) calls
// router.replace() from its own handlers, and leaving it undefined would
// throw the moment any test does exercise that path.
const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/conversations',
}));
jest.mock('@/hooks/use-conversations', () => ({
  useConversations: () => mockConversations,
}));
jest.mock('@/lib/queue-context', () => ({
  useQueueContext: () => ({ drafts: [], status: 'ready', error: null, reload: jest.fn(), optimisticallyRemove: jest.fn(), restore: jest.fn() }),
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

beforeEach(() => {
  mockRouter.push.mockClear();
  mockConversations = {
    conversations: [ACTIVE, QUIET_NEW],
    status: 'ready',
    error: null,
    reload: jest.fn().mockResolvedValue(undefined),
  };
});

describe('ConversationsScreen', () => {
  it('renders the headline and both rows', () => {
    render(<ConversationsScreen />);
    expect(screen.getByText('Everything happening.')).toBeTruthy();
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Ben A.')).toBeTruthy();
  });

  it('shows the active/total counts', () => {
    render(<ConversationsScreen />);
    // 1 active (within 60 min), 2 total.
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('navigates to the guest thread when a row is pressed', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText('Open conversation with Maya R.'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/conversations/[guestId]',
      params: { guestId: 'g1' },
    });
  });

  it('filters to only active conversations when the Active pill is pressed', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText('Active'));
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.queryByText('Ben A.')).toBeNull();
  });

  it('filters by guest type via the dropdown', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText(/All guests/));
    fireEvent.press(screen.getByLabelText('New'));
    expect(screen.queryByText('Maya R.')).toBeNull();
    expect(screen.getByText('Ben A.')).toBeTruthy();
  });

  it('shows the conversations empty state when the filter matches nothing', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText(/All guests/));
    fireEvent.press(screen.getByLabelText('Raving Fan'));
    expect(screen.getByText('Nothing here right now.')).toBeTruthy();
  });

  it('shows a loading indicator while status is loading', () => {
    mockConversations = { ...mockConversations, status: 'loading' };
    render(<ConversationsScreen />);
    expect(screen.queryByText('Everything happening.')).toBeNull();
  });

  it('shows a retry affordance on error', () => {
    mockConversations = { ...mockConversations, status: 'error', error: { kind: 'NETWORK' } as any };
    render(<ConversationsScreen />);
    expect(screen.getByLabelText('Retry loading conversations')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- conversations-index`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `app/conversations/_layout.tsx`**

```tsx
// app/conversations/_layout.tsx
import { Stack } from 'expo-router';

export default function ConversationsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[guestId]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
```

- [ ] **Step 4: Write `app/conversations/index.tsx`**

```tsx
// app/conversations/index.tsx
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HamburgerMenu } from '@/components/menu/hamburger-menu';
import { ConversationRow } from '@/components/conversations/conversation-row';
import { TypeFilterMenu, type TypeFilterOption } from '@/components/conversations/type-filter-menu';
import { EmptyState } from '@/components/queue/empty-state';
import { QueueTabsHeader } from '@/components/shell/queue-tabs-header';
import { useConversations } from '@/hooks/use-conversations';
import { isConversationActive } from '@/lib/conversations-format';
import { type RecognitionState } from '@/lib/api/queue';
import { conversations as conversationsTheme, recognition } from '@/lib/theme';
import { supabase } from '@/lib/supabase/client';

const RECOGNITION_KEYS: RecognitionState[] = ['new', 'returning', 'regular', 'raving_fan'];

export default function ConversationsScreen() {
  const conversationsResult = useConversations();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilterOption>('all');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  const activeCount = useMemo(
    () =>
      conversationsResult.conversations.filter((c) =>
        isConversationActive(c.lastMessageAt, conversationsTheme.activeWindowMins),
      ).length,
    [conversationsResult.conversations],
  );
  const totalCount = conversationsResult.conversations.length;

  const counts: Record<TypeFilterOption, number> = useMemo(() => {
    const base: Record<TypeFilterOption, number> = {
      all: conversationsResult.conversations.length,
      new: 0,
      returning: 0,
      regular: 0,
      raving_fan: 0,
    };
    for (const c of conversationsResult.conversations) {
      if (c.recognitionState) base[c.recognitionState] += 1;
    }
    return base;
  }, [conversationsResult.conversations]);

  const rows = useMemo(() => {
    return conversationsResult.conversations
      .filter((c) => (typeFilter === 'all' ? true : c.recognitionState === typeFilter))
      .filter((c) =>
        activeOnly
          ? isConversationActive(c.lastMessageAt, conversationsTheme.activeWindowMins)
          : true,
      );
  }, [conversationsResult.conversations, typeFilter, activeOnly]);

  const typeLabel =
    typeFilter === 'all' ? 'All guests' : recognition.stateLabels[typeFilter as RecognitionState];

  const handleSignOut = (): void => {
    void supabase.auth.signOut();
  };

  return (
    <SafeAreaView className="flex-1 bg-sand" style={{ position: 'relative' }}>
      <QueueTabsHeader onMenuPress={() => setMenuOpen(true)} />

      {conversationsResult.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C66A4A" />
        </View>
      ) : conversationsResult.status === 'error' ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-fraunces text-ink" style={{ fontSize: 24, textAlign: 'center' }}>
            We couldn&rsquo;t load conversations.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading conversations"
            onPress={() => void conversationsResult.reload()}
            className="mt-6 rounded-lg border-[0.5px] border-hairline px-5 py-3"
          >
            <Text
              className="font-inter-tight-medium uppercase text-ink"
              style={{ fontSize: 10, letterSpacing: 1.8 }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 10 }}>
            <Text
              className="font-fraunces text-ink"
              style={{ fontSize: 27, lineHeight: 32, letterSpacing: -0.4 }}
            >
              Everything happening.
            </Text>
            <View className="flex-row items-baseline" style={{ marginTop: 7, gap: 7 }}>
              <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 13 }}>
                {activeCount}
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
                active now
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
                ·
              </Text>
              <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 13 }}>
                {totalCount}
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
                open
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingBottom: 14 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Active"
              onPress={() => setActiveOnly((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: activeOnly ? '#1C1814' : '#FFFFFF',
                borderWidth: 0.5,
                borderColor: activeOnly ? '#1C1814' : 'rgba(28, 24, 20, 0.12)',
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 5,
                  backgroundColor: activeOnly ? '#E5B19C' : '#C66A4A',
                }}
              />
              <Text
                className="font-inter-tight-medium"
                style={{ fontSize: 11.5, color: activeOnly ? '#F7F1E3' : '#4A4339' }}
              >
                Active
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${typeLabel} filter`}
              onPress={() => setTypeMenuOpen((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: typeFilter === 'all' ? '#FFFFFF' : '#EDE4D2',
                borderWidth: 0.5,
                borderColor: 'rgba(28, 24, 20, 0.12)',
              }}
            >
              <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 11.5 }}>
                {typeLabel}
              </Text>
              <Text style={{ fontSize: 9, opacity: 0.6 }}>▾</Text>
            </Pressable>
          </View>

          <TypeFilterMenu
            visible={typeMenuOpen}
            selected={typeFilter}
            counts={counts}
            onSelect={(option) => {
              setTypeFilter(option);
              setTypeMenuOpen(false);
            }}
            onDismiss={() => setTypeMenuOpen(false)}
          />

          {rows.length === 0 ? (
            <EmptyState variant="conversations" />
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 20 }}>
              <View
                className="rounded-[16px] border-[0.5px] border-hairline bg-white"
                style={{ overflow: 'hidden' }}
              >
                {rows.map((row, i) => (
                  <ConversationRow
                    key={row.guestId}
                    conversation={row}
                    isFirst={i === 0}
                    onPress={() =>
                      router.push({
                        pathname: '/conversations/[guestId]',
                        params: { guestId: row.guestId },
                      })
                    }
                  />
                ))}
              </View>
            </View>
          )}
        </>
      )}

      <HamburgerMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Register the route in the root layout**

In `app/_layout.tsx`, inside the existing `<Stack.Protected guard={isSignedIn}>` block, add the new screen next to `queue`:

```tsx
<Stack.Protected guard={isSignedIn}>
  <Stack.Screen name="index" />
  <Stack.Screen name="queue" />
  <Stack.Screen name="conversations" />
</Stack.Protected>
```

- [ ] **Step 6: Run test to verify it passes, then typecheck**

Run: `npm test -- conversations-index`
Expected: PASS (8 tests).

Run: `npm run typecheck`
Expected: no errors (this also confirms `regen-typed-routes.cjs` picks up the two new `app/conversations/*` files and the `/conversations/[guestId]` route-string used in Step 4 typechecks).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, no regressions anywhere.

- [ ] **Step 8: Commit**

```bash
git add app/conversations/_layout.tsx app/conversations/index.tsx app/_layout.tsx __tests__/screens/conversations-index.test.tsx
git commit -m "add conversations list screen and register the route"
```

---

## Task 12: Conversation thread screen (read-only)

**Files:**
- Create: `app/conversations/[guestId].tsx`
- Test: `__tests__/screens/conversations-thread.test.tsx`

**Interfaces:**
- Consumes: `getGuestThread` from `@/lib/api/conversations`; `useThreadRealtime` from `@/hooks/use-thread-realtime` (existing, already keyed by venueId+guestId); `computeItems` from `@/lib/thread-cluster`; `ThreadBubbleList` (Task 7); `RecognitionBadge` (existing); `formatConversationsSince`, `isConversationActive` (Task 2); the conversations list's already-fetched summary for this guest, read back out of `useConversations()`'s current state via `useLocalSearchParams` for the guestId and a `find` against `conversationsResult.conversations` (the list screen already has full guest metadata — no need for a second summary fetch, only the message thread itself needs its own fetch).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/screens/conversations-thread.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ThreadScreen from '@/app/conversations/[guestId]';
import { type UseConversationsResult } from '@/hooks/use-conversations';
import { type ConversationSummary } from '@/lib/api/conversations';
import { getGuestThread } from '@/lib/api/conversations';

const GUEST: ConversationSummary = {
  guestId: 'g1',
  venueId: 'v1',
  venueSlug: 'mock-sextant',
  venueTimezone: 'America/Los_Angeles',
  agentName: 'Sana',
  name: 'Maya R.',
  phoneFallback: '+15551110001',
  recognitionState: 'returning',
  lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Done — got you down for two at 7:30.',
  conversationCount: 4,
  firstConversationAt: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString(),
};

const mockRouter = { back: jest.fn() };
const mockParams = { guestId: 'g1' };

let mockConversations: UseConversationsResult = {
  conversations: [GUEST],
  status: 'ready',
  error: null,
  reload: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/hooks/use-conversations', () => ({
  useConversations: () => mockConversations,
}));
jest.mock('@/hooks/use-thread-realtime', () => ({
  useThreadRealtime: () => undefined,
}));
jest.mock('@/lib/api/conversations', () => {
  const actual = jest.requireActual('@/lib/api/conversations');
  return { ...actual, getGuestThread: jest.fn() };
});

const mockGetGuestThread = getGuestThread as jest.Mock;

beforeEach(() => {
  mockRouter.back.mockClear();
  mockGetGuestThread.mockReset();
  mockGetGuestThread.mockResolvedValue({
    ok: true,
    data: [
      {
        id: '1',
        direction: 'inbound',
        body: 'Hi! Is the patio open tonight?',
        createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
      {
        id: '2',
        direction: 'outbound',
        body: 'Done — got you down for two at 7:30.',
        createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      },
    ],
  });
});

describe('ConversationThreadScreen', () => {
  it('renders the guest name, badge, and meta line', async () => {
    render(<ThreadScreen />);
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Returning')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/4 conversations since/)).toBeTruthy());
  });

  it('fetches and renders the thread', async () => {
    render(<ThreadScreen />);
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());
    expect(screen.getByText('Done — got you down for two at 7:30.')).toBeTruthy();
  });

  it('renders the agent-handling footer note with the real agent name', async () => {
    render(<ThreadScreen />);
    // Note: the JSX footer text uses `&rsquo;` (renders as a curly ’), not a
    // plain ASCII apostrophe — match what actually renders, not what's easy
    // to type.
    await waitFor(() =>
      expect(
        screen.getByText(/Sana is handling this one\. You’ll see it in the queue if it needs your input\./),
      ).toBeTruthy(),
    );
  });

  it('does not render any compose input or send button', async () => {
    render(<ThreadScreen />);
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());
    expect(screen.queryByLabelText(/send/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/type/i)).toBeNull();
  });

  it('navigates back when the back chevron is pressed', () => {
    render(<ThreadScreen />);
    fireEvent.press(screen.getByLabelText('Back to conversations'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- conversations-thread`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// app/conversations/[guestId].tsx
// Read-only thread viewer for the Conversations tab — no compose box, no
// send/edit/skip actions. The agent handles these conversations
// autonomously; the operator only intervenes via the Queue tab when
// something is flagged.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { useConversations } from '@/hooks/use-conversations';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { type ThreadMessage, getGuestThread } from '@/lib/api/conversations';
import { formatConversationsSince, isConversationActive } from '@/lib/conversations-format';
import { conversations as conversationsTheme } from '@/lib/theme';
import { computeItems } from '@/lib/thread-cluster';

type ThreadState =
  | { kind: 'loading'; messages: ThreadMessage[] }
  | { kind: 'ready'; messages: ThreadMessage[] }
  | { kind: 'error'; messages: ThreadMessage[] };

export default function ConversationThreadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guestId: string }>();
  const conversationsResult = useConversations();
  const guest = useMemo(
    () => conversationsResult.conversations.find((c) => c.guestId === params.guestId) ?? null,
    [conversationsResult.conversations, params.guestId],
  );

  const [threadState, setThreadState] = useState<ThreadState>({ kind: 'loading', messages: [] });

  useEffect(() => {
    if (!params.guestId) return;
    let cancelled = false;
    void (async () => {
      const result = await getGuestThread(params.guestId);
      if (cancelled) return;
      if (result.ok) {
        setThreadState({ kind: 'ready', messages: result.data });
      } else {
        setThreadState((prev) => ({ kind: 'error', messages: prev.messages }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.guestId]);

  useThreadRealtime({
    venueId: guest?.venueId ?? '',
    guestId: params.guestId ?? '',
    onInsert: (message) => setThreadState((prev) => ({ kind: prev.kind, messages: [...prev.messages, message] })),
    onUpdate: (message) =>
      setThreadState((prev) => ({
        kind: prev.kind,
        messages: prev.messages.map((m) => (m.id === message.id ? message : m)),
      })),
  });

  const timezone = guest?.venueTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const items = useMemo(() => computeItems(threadState.messages, timezone), [threadState.messages, timezone]);

  if (!guest) {
    return (
      <SafeAreaView className="flex-1 bg-sand">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-fraunces text-ink" style={{ fontSize: 22, textAlign: 'center' }}>
            That conversation isn&rsquo;t available.
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            className="mt-6 rounded-lg border-[0.5px] border-hairline px-5 py-3"
          >
            <Text className="font-inter-tight-medium uppercase text-ink" style={{ fontSize: 10, letterSpacing: 1.8 }}>
              Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const active = isConversationActive(guest.lastMessageAt, conversationsTheme.activeWindowMins);
  const displayName = guest.name ?? guest.phoneFallback;
  const lastMessage = threadState.messages[threadState.messages.length - 1];
  const lastLine = lastMessage
    ? lastMessage.direction === 'inbound'
      ? `From the guest · ${new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : `Sent by ${guest.agentName} · ${new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : null;

  return (
    <SafeAreaView className="flex-1 bg-sand" edges={['top', 'left', 'right']}>
      <View
        className="flex-row items-center border-b-[0.5px] border-hairline bg-sand"
        style={{ gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to conversations"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={{ fontSize: 22, lineHeight: 22, color: '#1C1814' }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, gap: 3 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 15 }}>
              {displayName}
            </Text>
            <RecognitionBadge state={guest.recognitionState} />
          </View>
          <Text
            className="font-inter-tight text-ink-faint"
            numberOfLines={1}
            style={{ fontSize: 11, letterSpacing: 0.3 }}
          >
            {guest.phoneFallback} · {formatConversationsSince(guest.conversationCount, guest.firstConversationAt)}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 20,
            backgroundColor: 'rgba(28, 24, 20, 0.05)',
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 5,
              backgroundColor: active ? '#C66A4A' : '#857A6A',
            }}
          />
          <Text
            className="font-inter-tight-medium uppercase text-ink-soft"
            style={{ fontSize: 10, letterSpacing: 1.1 }}
          >
            {active ? 'Live' : 'Quiet'}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, gap: 4 }}
      >
        <ThreadBubbleList items={items} />
        {lastLine ? (
          <Text
            className="self-end font-inter-tight text-ink-faint"
            style={{ fontSize: 10.5, letterSpacing: 0.6, paddingTop: 6 }}
          >
            {lastLine}
          </Text>
        ) : null}
      </ScrollView>

      <View
        className="flex-row border-t-[0.5px] border-hairline bg-paper"
        style={{ gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: '#C66A4A', marginTop: 6 }} />
        <Text className="font-inter-tight text-ink-soft" style={{ fontSize: 12.5, lineHeight: 18, flex: 1 }}>
          {guest.agentName} is handling this one. You&rsquo;ll see it in the queue if it needs your input.
        </Text>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- conversations-thread`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/conversations/[guestId].tsx __tests__/screens/conversations-thread.test.tsx
git commit -m "add read-only conversation thread screen"
```

---

## Task 13: Full verification pass + on-device smoke test note

**Files:** none new — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, every test file including all new ones from Tasks 1–12.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Report the required on-device smoke test**

This plan touched `app/_layout.tsx` twice (Task 1's `QueueProvider` lift, Task 11's new `conversations` screen registration). Per CLAUDE.md, tell Jaipal explicitly: **an on-device smoke test (cold launch + queue swipe, plus tapping into the new Conversations tab and opening a thread) is required before this ships** — unit tests don't catch gesture-handler root-view regressions or native-host wrapper drops, and this plan's own execution can't run Expo Go on a physical device.

- [ ] **Step 5: Report cross-repo status**

Tell Jaipal whether the sibling `analog-guest` plan's endpoints have been curl-verified yet. If not, this build is complete and fully testable in fixture mode, but live-mode wiring (already written and unit-tested against mocked `fetch` in Task 4) has never actually talked to the real endpoints — per the repo's cross-repo Done-gate rule, this ticket pair cannot close until both a) the backend curl-verification (sibling plan, Task 8) and b) a manual end-to-end on-device run against the live API have both happened.
