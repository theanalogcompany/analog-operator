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

/**
 * Which channel a card sends on, or a conversation is on. (TAC-473 Contract.)
 *
 * A BARE enum with no `.catch()`, deliberately. The Contract guarantees the
 * field is "ALWAYS PRESENT — never `undefined`, never absent — so the client
 * never branches on presence", and the server half shipped first. The two
 * failure modes if that ever stops being true are not symmetric: a bare enum
 * empties the whole queue, loudly, and is fixed by a server deploy; a
 * `.catch('text')` would quietly render every Instagram card as a text card,
 * with no window and no timer, and leave a swipe-right that looks available and
 * fails at the send gate. Loud beats silent when the silent version hands the
 * operator a card that lies about what it will do.
 */
export const GuestChannelSchema = z.enum(['text', 'instagram']);
export type GuestChannel = z.infer<typeof GuestChannelSchema>;

/**
 * The draft text a regen replaced, when a guest's correction rewrote a pending
 * card in place. (TAC-397 Contract; this is its client half.)
 *
 * `.catch(null)` where it is used, per that Contract: the field is always
 * present, but it is display-only, so an unreadable one costs a caption rather
 * than the queue. Only ever the MOST RECENT prior body — a draft regenerated
 * twice carries no history.
 */
export const ReplacedDraftSchema = z.object({
  body: z.string(),
  replacedAt: z.string(),
});
export type ReplacedDraft = z.infer<typeof ReplacedDraftSchema>;

/**
 * The guest message this draft is answering. (TAC-533 Contract; TAC-534 is the
 * server half.)
 *
 * The BODY is on the wire, not just the id, and that is the whole point of the
 * pair. `recentContext` is the last three messages; since TAC-397 gave each
 * unanswered question its own card, the message a given card answers is
 * routinely older than that, which is the defect being fixed. An id alone
 * would name a message the client does not hold and so could not quote.
 *
 * `.catch(null)` for the same reason `replacedDraft` uses it, plus one more: it
 * also absorbs the field being ABSENT, which it is until TAC-534 deploys. The
 * client ships ahead and the quote simply does not render until the server
 * starts sending it, which is exactly today's card. No tighten is owed later.
 *
 * The Contract's third field, `createdAt`, is deliberately NOT parsed. Nothing
 * renders it, and under `.catch(null)` a required field that nothing reads can
 * only ever cost a quote whose `messageId` and `body` were both fine. Zod drops
 * it silently. Add it back the day something shows a timestamp on the row.
 *
 * `body` may be EMPTY and is not rejected here. A media-only inbound is stored
 * with `body: ''` (TAC-411), so an empty one is a real card, not a malformed
 * payload. `shouldShowReplyQuote` in `components/queue/reply-quote.tsx` is where
 * that becomes "nothing to quote", because it also covers the fabricated drafts
 * and fixtures that never pass through this schema.
 */
export const ReplyingToSchema = z.object({
  messageId: z.string().uuid(),
  body: z.string(),
});
export type ReplyingTo = z.infer<typeof ReplyingToSchema>;

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
    // Venue IANA timezone for rendering times in venue-local time instead of
    // the device timezone. Optional (no default) so it's absent → `undefined`
    // when the backend deploy predates this field; consumers fall back to the
    // device tz via `?? `. (Distinct from `agentReasoning`'s `.default(null)`
    // because we don't want every PendingDraft literal to have to carry it.)
    venueTimezone: z.string().nullable().optional(),
    guestId: z.string().uuid(),
    guestDisplayName: z.string().nullable(),
    guestPhoneFallback: z.string(),
    // TAC-473 Contract, all three ALWAYS PRESENT on the wire.
    //
    // On a DRAFT, `guestChannel` is the draft row's own `messages.channel`, not
    // a property re-derived from the guest: it is exactly "what approving this
    // card will do", because `dispatchOperatorOutbound` routes on that same
    // value. Anything re-derived could disagree with the routing and tell the
    // operator the wrong thing.
    guestChannel: GuestChannelSchema,
    // The TRUE deadline, Meta's clock, no margin subtracted — the Contract is
    // explicit that the client subtracts its own. See lib/reply-window.ts.
    //
    // `null` has TWO causes and they are not the same: a text guest has no
    // window, while an Instagram guest with `null` has one nobody has measured.
    // `windowState` tells them apart with `guestChannel` and never renders the
    // second as expired.
    replyWindowExpiresAt: z.string().nullable(),
    // The handle WITHOUT a leading `@`; we prepend it for display. A non-blank
    // CHECK on the column means an absent handle is always `null`, never `''`.
    instagramUsername: z.string().nullable(),
    draftBody: z.string(),
    category: z.string().nullable(),
    voiceFidelity: z.number().nullable(),
    reviewReason: z.string().nullable(),
    // TAC-364. Contract-locked and always present on the wire: the RAW primary
    // trigger code, the full trigger set as codes (primary included, never
    // deduped server-side), the display labels parallel to it, and the claims
    // the grounding check flagged, verbatim. The ground keys on
    // `reviewReasonCode`, never on `reviewReason`'s prose.
    //
    // `.catch` rather than a strict parse: `drafts` is one array, so a single
    // malformed field would fail the whole queue, and each fallback is exactly
    // what "nothing recorded" means. `''` puts the card on the mid-thread ground
    // (lib/review-bucket.ts); `[]` renders nothing.
    reviewReasonCode: z.string().catch(''),
    reviewTriggers: z.array(z.string()).catch([]),
    reviewTriggerLabels: z.array(z.string()).catch([]),
    ungroundedClaims: z.array(z.string()).catch([]),
    recognitionState: RecognitionStateSchema.nullable(),
    // Tolerant during the cross-repo rollout: TAC-278 introduces the
    // server-side `agent_reasoning` column + RPC SELECT. Until that ships
    // the field is absent from JSON; the optional+default(null) chain lets
    // this client parse cleanly either way. Tighten to .nullable() in a
    // follow-up once both sides are live.
    agentReasoning: z.string().nullable().optional().default(null),
    // TAC-397 Contract. Non-null only on a draft regenerated in place because
    // the guest corrected the question it was answering; the operator sees the
    // text it replaced so they can check the new one still answers everything.
    //
    // NOTE: `otherPendingDraftsForGuest` is deliberately NOT read here. The
    // sub-queue row ("1 / 3 cards for Mia") needs a POSITION as well as a
    // total, which that field cannot give, and it is derived from the deck
    // instead — which is venue-filtered and reflects optimistic removals, so it
    // can never disagree with the cards actually on screen. (TAC-486.)
    replacedDraft: ReplacedDraftSchema.nullable().catch(null),
    // TAC-533 Contract. Absent until TAC-534 deploys; `.catch(null)` treats
    // absent, null and unreadable alike, so the quote is withheld rather than
    // the whole queue failing to parse.
    replyingTo: ReplyingToSchema.nullable().catch(null),
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

// Matches `HeadsUpCommitment` from analog-guest/lib/schemas/guest-commitment.ts
// (TAC-297, TAC-299, TAC-364): a `pending_ack` commitment, the arrival card for
// a guest the agent promised something to. The casing is mixed ON THE WIRE and
// is transcribed as-is: the TAC-297 fields are snake_case (`expected_arrival`,
// `created_at`), everything added since is camelCase.
//
// Parsed one item at a time and tolerantly, per the Contract ("degrade
// gracefully if a field is absent rather than dropping the card"). The three
// ids are the exception, because a card missing one cannot be acted on (`id`),
// cannot be venue-scoped (`venueId`: without it the card would have to bypass
// `filterByVenue`, the cross-venue leak TAC-382 fixed) or cannot be resolved
// from a push (`guestId`). An item missing an id is dropped on its own and
// never fails the rest of the queue. (TAC-364.)
export const HeadsUpCommitmentSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  guestId: z.string().uuid(),
  type: z.string().catch(''),
  guest: z.object({ name: z.string().catch('') }).catch({ name: '' }),
  description: z.string().catch(''),
  code: z.string().nullable().catch(null),
  expected_arrival: z.string().nullable().catch(null),
  created_at: z.string().nullable().catch(null),
  recognitionState: RecognitionStateSchema.nullable().catch(null),
  sourceMessageId: z.string().uuid().nullable().catch(null),
});
export type HeadsUpCommitment = z.infer<typeof HeadsUpCommitmentSchema>;

export type QueueSnapshot = {
  drafts: PendingDraft[];
  commitments: HeadsUpCommitment[];
};

// Server (`analog-guest` GET /api/operator/queue) returns
// `{ drafts: QueueDraft[], commitments: HeadsUpCommitment[] }` — see
// analog-guest/app/api/operator/queue/route.ts. `commitments` used to be
// undeclared here, so Zod stripped it at this boundary: every heads-up card the
// server sent was discarded while its arrival push still fired. It is read as
// raw items and parsed individually below, so one unreadable commitment costs
// that card rather than the whole queue. (TAC-364.)
const ListQueueResponseSchema = z.object({
  drafts: z.array(PendingDraftSchema),
  commitments: z.array(z.unknown()).catch([]),
});

function parseCommitments(raw: readonly unknown[]): HeadsUpCommitment[] {
  const commitments: HeadsUpCommitment[] = [];
  for (const item of raw) {
    const parsed = HeadsUpCommitmentSchema.safeParse(item);
    if (parsed.success) {
      commitments.push(parsed.data);
    } else if (__DEV__) {
      console.warn('[api/queue] dropped an unreadable commitment', parsed.error.message);
    }
  }
  return commitments;
}

// `POST /api/operator/commitments/:id/draft-decline` returns
// `{ messageId, body }` (TAC-299; `body` added by TAC-364).
const DeclineCommitmentResponseSchema = z.object({
  messageId: z.string().uuid(),
  body: z.string(),
});
export type DeclineCommitmentResult = z.infer<typeof DeclineCommitmentResponseSchema>;

// `GET /api/operator/messages/:messageId/thread` returns
// `{ messages: ThreadMessage[] }` per the TAC-277/TAC-290 Contract. Parsed and
// unwrapped to a bare array, mirroring `listQueue`'s `{ drafts }` unwrap.
const GetThreadResponseSchema = z.object({
  messages: z.array(ThreadMessageSchema),
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

export async function listQueue(): Promise<Result<QueueSnapshot>> {
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
  const parsed = ListQueueResponseSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok({
    drafts: parsed.data.drafts,
    commitments: parseCommitments(parsed.data.commitments),
  });
}

/**
 * Approve the draft as-written (swipe-right). Deliberately sends NO request
 * body: `/approve` means "ship what's stored", and the server reads the stored
 * draft body itself. That fallback is also why a blank stored body returns 422
 * empty_body rather than sending nothing — so callers must block empty drafts
 * locally before calling this (see `handleApprove` in `app/queue/index.tsx`).
 * If you find yourself wanting to pass text here, you want `editAndSend`.
 * (TAC-309 Contract; TAC-310.)
 */
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

/**
 * POST the operator's edited text to `/edit`.
 *
 * The request field is `editedBody` — character-exact per the TAC-309 Contract.
 * This shipped as `{ body }` and the server never read it: `editedBody` came
 * through as absent, coerced to `''`, and every send failed 400 invalid_input
 * with the operator's typed text sitting in the payload under a key nobody
 * looked at. Do not rename this field to match the local `body` parameter.
 * (TAC-310.)
 *
 * Callers must pass an already-trimmed, non-empty string — the empty case is a
 * local block at the screen layer, not a server round-trip.
 */
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
      body: JSON.stringify({ editedBody: body }),
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

/**
 * Acknowledge a heads-up card (swipe-right). `POST …/acknowledge` with no
 * request body moves the commitment `pending_ack → acknowledged`, and that is
 * all it does: nothing is sent to the guest. Never interchangeable with
 * `approveDraft`, which ships a message. (TAC-297 Contract; TAC-364.)
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
  return emptyOkOrError(result.data);
}

/**
 * Start declining a heads-up card (swipe-left). `POST …/draft-decline` with no
 * request body has the server write an apology, persist it as a PENDING draft
 * (not sent), cancel the commitment, and return `{ messageId, body }`. Nothing
 * reaches the guest until the operator sends that draft from the edit
 * takeover. (TAC-299 Contract; `body` added by TAC-364.)
 */
export async function declineCommitment(
  commitmentId: string,
): Promise<Result<DeclineCommitmentResult>> {
  if (isFixtureMode()) {
    return fixtures.declineCommitmentFixture(commitmentId);
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
  const parsed = DeclineCommitmentResponseSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data);
}

/**
 * A commitment the server no longer holds in `pending_ack`: 404 when it is gone
 * or outside the operator's venues, 409 when it was already acknowledged or
 * declined (another operator, another device). Either way the card has nothing
 * left to act on, so the caller clears it rather than restoring it.
 */
export function isCommitmentGone(error: ApiError): boolean {
  return error.kind === 'HTTP' && (error.status === 404 || error.status === 409);
}
