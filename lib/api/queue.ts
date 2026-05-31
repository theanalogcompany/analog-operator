import { z } from 'zod';

import * as fixtures from '@/lib/fixtures/queue';
import {
  HeadsUpCommitmentSchema,
  type HeadsUpCommitment,
} from '@/lib/api/commitments';
import {
  RecognitionStateSchema,
  type RecognitionState,
  isFixtureMode,
} from '@/lib/api/shared';

import { authedFetch, parseHttpError } from './client';
import { type ApiError, type Result, err, ok } from './errors';

// Back-compat re-exports — existing call sites import these from `@/lib/api/queue`.
// New code should import directly from `@/lib/api/shared`.
export { RecognitionStateSchema, isFixtureMode };
export type { RecognitionState };

export const RecentContextEntrySchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  body: z.string(),
  createdAt: z.string(),
});
export type RecentContextEntry = z.infer<typeof RecentContextEntrySchema>;

// Full-thread message — same shape as RecentContextEntry, distinct type so
// callers reading "thread" don't conflate it with the queue's last-3 preview.
// Intentionally NOT `.strict()`: TAC-277's Out-of-Scope preserves forward-compat
// ("Response schema can be extended later without breaking existing clients"),
// so any future additive field (editedAt, voiceFidelity, etc.) drops silently
// instead of failing every pre-update client on every fetch. (TAC-290.)
export const ThreadMessageSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  body: z.string(),
  createdAt: z.string(),
});
export type ThreadMessage = z.infer<typeof ThreadMessageSchema>;

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

// Server (`analog-guest` GET /api/operator/queue) returns both pending drafts
// and `pending_ack` heads-up commitments in a single envelope —
// `{ drafts: [...], commitments: [...] }`. See
// analog-guest/app/api/operator/queue/route.ts. The `commitments` field was
// added in TAC-297 + extended in TAC-299; `.default([])` keeps this client
// parsing cleanly against older deploys / future drift. (TAC-298.)
//
// `commitments` is parsed as `z.array(z.unknown())` at the envelope level so
// the OUTER parse never fails on a single drifted item. Each item is then
// run through `HeadsUpCommitmentSchema.safeParse` individually — successful
// items render; failures are dropped with a __DEV__ warn carrying the field
// path. The same cross-repo rationale that drove tolerant nullable+default()
// at the FIELD level (CLAUDE.md "Tolerant Zod chains during cross-repo
// rollouts") applies at the ARRAY level: one drifted commitment must never
// cascade into the entire queue going error-state. Drafts stay strict at the
// schema level — that contract has been live and stable since TAC-258. (TAC-298
// UAT follow-up.)
const ListQueueEnvelopeSchema = z.object({
  drafts: z.array(PendingDraftSchema),
  commitments: z.array(z.unknown()).default([]),
});

export type ListQueueResult = {
  drafts: PendingDraft[];
  commitments: HeadsUpCommitment[];
};

// `GET /api/operator/messages/:messageId/thread` returns
// `{ messages: ThreadMessage[] }` per the TAC-277/TAC-290 Contract. Parsed and
// unwrapped to a bare array, mirroring `listQueue`'s `{ drafts }` unwrap.
const GetThreadResponseSchema = z.object({
  messages: z.array(ThreadMessageSchema),
});

function parseFailure(reason: string): { ok: false; error: ApiError } {
  return err<ApiError>({ kind: 'PARSE', message: reason });
}

async function emptyOkOrError(response: Response): Promise<Result<void>> {
  if (response.ok) return ok(undefined);
  return err<ApiError>(await parseHttpError(response));
}

export async function listQueue(): Promise<Result<ListQueueResult>> {
  if (isFixtureMode()) {
    return ok({
      drafts: fixtures.listQueueFixture(),
      commitments: fixtures.listCommitmentsFixture(),
    });
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
  const parsed = ListQueueEnvelopeSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  const commitments: HeadsUpCommitment[] = [];
  for (const raw of parsed.data.commitments) {
    const r = HeadsUpCommitmentSchema.safeParse(raw);
    if (r.success) {
      commitments.push(r.data);
    } else if (__DEV__) {
      // Drift surfaces here. Most likely cause is a server field whose shape
      // diverged from `HeadsUpCommitmentSchema` (e.g. an additive enum value
      // or a UUID field that came back malformed) — issues include the
      // failing field path, which is the fast path to the root cause.
      console.warn(
        '[lib/api/queue] dropped malformed commitment',
        JSON.stringify(r.error.issues),
        'raw=',
        raw,
      );
    }
  }
  if (__DEV__ && parsed.data.commitments.length !== commitments.length) {
    console.warn(
      `[lib/api/queue] commitments raw=${parsed.data.commitments.length} parsed=${commitments.length} (drift: ${parsed.data.commitments.length - commitments.length} dropped)`,
    );
  }
  return ok({
    drafts: parsed.data.drafts,
    commitments,
  });
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

export async function getThread(
  messageId: string,
): Promise<Result<ThreadMessage[]>> {
  if (isFixtureMode()) {
    return ok(fixtures.getThreadFixture(messageId));
  }
  const result = await authedFetch(
    `/api/operator/messages/${encodeURIComponent(messageId)}/thread`,
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
  const parsed = GetThreadResponseSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data.messages);
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
