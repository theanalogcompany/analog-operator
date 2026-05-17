import { z } from 'zod';

import * as fixtures from '@/lib/fixtures/queue';

import { authedFetch, parseHttpError } from './client';
import { type ApiError, type Result, err, ok } from './errors';

export const RecognitionStateSchema = z.enum([
  'new',
  'returning',
  'regular',
  'raving_fan',
]);
export type RecognitionState = z.infer<typeof RecognitionStateSchema>;

export const RecentContextEntrySchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  body: z.string(),
  createdAt: z.string(),
});
export type RecentContextEntry = z.infer<typeof RecentContextEntrySchema>;

// Matches `QueueDraft` from analog-guest/lib/operator/queue.ts (TAC-258).
// All camelCase per the server contract.
//
// `recentContext` is normalized to oldest-first at the parse boundary so
// both the queue card and the edit screen iterate in chronological order
// without each having to re-sort. The server RPC currently returns
// newest-first (`order by created_at desc`); the .transform() flips it
// once here so consumers never need to think about ordering. (TAC-280.)
export const PendingDraftSchema = z
  .object({
    messageId: z.string().uuid(),
    venueId: z.string().uuid(),
    venueSlug: z.string(),
    guestId: z.string().uuid(),
    guestDisplayName: z.string().nullable(),
    guestPhoneFallback: z.string(),
    draftBody: z.string(),
    category: z.string().nullable(),
    voiceFidelity: z.number().nullable(),
    reviewReason: z.string().nullable(),
    recognitionState: RecognitionStateSchema.nullable(),
    // Tolerant during the cross-repo rollout: TAC-278 introduces the
    // server-side `agent_reasoning` column + RPC SELECT. Until that ships
    // the field is absent from JSON; the optional+default(null) chain lets
    // this client parse cleanly either way. Tighten to .nullable() in a
    // follow-up once both sides are live.
    agentReasoning: z.string().nullable().optional().default(null),
    pendingSinceMs: z.number(),
    recentContext: z.array(RecentContextEntrySchema).default([]),
    langfuseTraceId: z.string().nullable(),
  })
  .transform((draft) => ({
    ...draft,
    recentContext: [...draft.recentContext].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    ),
  }));
export type PendingDraft = z.infer<typeof PendingDraftSchema>;

// Server (`analog-guest` GET /api/operator/queue) returns the array wrapped
// in a { drafts: [...] } envelope — see analog-guest/app/api/operator/queue/
// route.ts. Parse the envelope and unwrap before returning.
const ListQueueResponseSchema = z.object({
  drafts: z.array(PendingDraftSchema),
});

export function isFixtureMode(): boolean {
  return process.env.EXPO_PUBLIC_USE_FIXTURES === 'true';
}

function parseFailure(reason: string): { ok: false; error: ApiError } {
  return err<ApiError>({ kind: 'PARSE', message: reason });
}

async function emptyOkOrError(response: Response): Promise<Result<void>> {
  if (response.ok) return ok(undefined);
  return err<ApiError>(await parseHttpError(response));
}

export async function listQueue(): Promise<Result<PendingDraft[]>> {
  if (isFixtureMode()) {
    return ok(fixtures.listQueueFixture());
  }
  const result = await authedFetch('/api/operator/queue', { method: 'GET' });
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  let json: unknown;
  try {
    json = await result.data.json();
  } catch (e) {
    return parseFailure(e instanceof Error ? e.message : 'invalid json');
  }
  const parsed = ListQueueResponseSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data.drafts);
}

export async function approveDraft(messageId: string): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.approveDraftFixture(messageId);
  }
  const result = await authedFetch(
    `/api/operator/messages/${encodeURIComponent(messageId)}/approve`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}

export async function editAndSend(
  messageId: string,
  body: string,
): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.editAndSendFixture(messageId, body);
  }
  const result = await authedFetch(
    `/api/operator/messages/${encodeURIComponent(messageId)}/edit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}

export async function skipDraft(messageId: string): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.skipDraftFixture(messageId);
  }
  const result = await authedFetch(
    `/api/operator/messages/${encodeURIComponent(messageId)}/skip`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}

export async function undoAction(messageId: string): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.undoActionFixture(messageId);
  }
  const result = await authedFetch(
    `/api/operator/messages/${encodeURIComponent(messageId)}/undo`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}
