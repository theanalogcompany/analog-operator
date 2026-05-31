import { z } from 'zod';

import * as fixtures from '@/lib/fixtures/queue';
import { authedFetch, parseHttpError } from '@/lib/api/client';
import { type ApiError, type Result, err, ok } from '@/lib/api/errors';
import {
  RecognitionStateSchema,
  isFixtureMode,
} from '@/lib/api/shared';

// Matches `HeadsUpCommitment` from analog-guest/lib/operator/heads-up-queue.ts
// (TAC-297 + TAC-299). Wire shape is mixed-case: heritage fields from TAC-297
// stay snake_case (matches the DB column names projected by the join);
// `recognitionState` and `sourceMessageId` added in TAC-299 are camelCase.
// The transform below flips the heritage fields to camelCase so callers in
// this codebase use a single idiomatic shape (`expectedArrival`, `createdAt`,
// `guestName`).
//
// Tolerant chain (`.nullable().optional().default(null)`) on the TAC-299
// fields is the cross-repo rollout safety net per the TAC-276 ↔ TAC-278
// precedent in CLAUDE.md "Common gotchas". The server now provides both
// fields; this guards against an older deploy or future schema drift.
export const HeadsUpCommitmentSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(['recommendation', 'hold', 'comp', 'discount']),
    guest: z.object({ name: z.string() }),
    description: z.string(),
    code: z.string().nullable(),
    expected_arrival: z.string().nullable(),
    created_at: z.string(),
    recognitionState: RecognitionStateSchema.nullable().optional().default(null),
    sourceMessageId: z.string().uuid().nullable().optional().default(null),
  })
  .transform((c) => ({
    id: c.id,
    type: c.type,
    guestName: c.guest.name,
    description: c.description,
    code: c.code,
    expectedArrival: c.expected_arrival,
    createdAt: c.created_at,
    recognitionState: c.recognitionState,
    sourceMessageId: c.sourceMessageId,
  }));
export type HeadsUpCommitment = z.infer<typeof HeadsUpCommitmentSchema>;
export type CommitmentType = HeadsUpCommitment['type'];

const DraftDeclineResponseSchema = z.object({
  messageId: z.string().uuid(),
});

function parseFailure(reason: string): { ok: false; error: ApiError } {
  return err<ApiError>({ kind: 'PARSE', message: reason });
}

/**
 * POST /api/operator/commitments/{id}/acknowledge — swipe-right on a heads-up
 * card. Server transitions commitment status `pending_ack → acknowledged`.
 * Never sends an outbound message. See TAC-297/TAC-298 Contract.
 */
export async function acknowledgeCommitment(
  commitmentId: string,
): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.acknowledgeCommitmentFixture(commitmentId);
  }
  const result = await authedFetch(
    `/api/operator/commitments/${encodeURIComponent(commitmentId)}/acknowledge`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  return ok(undefined);
}

/**
 * POST /api/operator/commitments/{id}/draft-decline — swipe-left on a
 * heads-up card. Server generates an apology decline draft (persisted
 * `messages.review_state='pending'`, NOT sent) and transitions the
 * commitment to `cancelled`. Returns `{ messageId }` so the operator app can
 * route to the existing edit screen on that draft. See TAC-299 Contract.
 *
 * **Not idempotent**: a second call on the same commitment returns 409
 * `{error:'invalid_state'}` since the commitment is no longer `pending_ack`.
 * The screen handler treats 409 as "already handled" (no restore, gentle
 * toast) — see `app/queue/index.tsx::handleDeclineDraft`.
 */
export async function declineDraft(
  commitmentId: string,
): Promise<Result<{ messageId: string }>> {
  if (isFixtureMode()) {
    return fixtures.declineDraftFixture(commitmentId);
  }
  const result = await authedFetch(
    `/api/operator/commitments/${encodeURIComponent(commitmentId)}/draft-decline`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  let json: unknown;
  try {
    json = await result.data.json();
  } catch (e) {
    return parseFailure(e instanceof Error ? e.message : 'invalid json');
  }
  const parsed = DraftDeclineResponseSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data);
}
