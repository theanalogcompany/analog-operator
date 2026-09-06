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
