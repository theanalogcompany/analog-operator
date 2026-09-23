/**
 * The decline draft, carried across the navigation into the edit takeover.
 *
 * Swiping left on a heads-up card asks the server to write an apology draft
 * (`POST …/draft-decline`), which it persists as a pending draft and returns as
 * `{ messageId, body }`. The edit takeover resolves its draft out of the queue
 * context's cached list, and that list cannot contain a row the server created
 * milliseconds ago, so without this the takeover's first paint was "That draft
 * is no longer pending" every single time. TAC-298 papered over it with a
 * blocking queue reload, which TAC-304 then filed as a 5 to 10 second lag.
 *
 * So the queue screen stages a draft built from what it already holds (the
 * commitment and the response) and the takeover falls back to it until the
 * realtime reload delivers the real row, which then takes over. It is keyed on
 * `messageId`, so a stale entry can never render for a different draft.
 * (TAC-364.)
 */

import { type DeclineCommitmentResult, type HeadsUpCommitment, type PendingDraft } from '@/lib/api/queue';
import { headsUpGuestName } from '@/lib/heads-up';

let staged: PendingDraft | null = null;

export function buildDeclineHandoffDraft(
  commitment: HeadsUpCommitment,
  declined: DeclineCommitmentResult,
): PendingDraft {
  return {
    messageId: declined.messageId,
    venueId: commitment.venueId,
    venueSlug: '',
    venueTimezone: null,
    guestId: commitment.guestId,
    guestDisplayName: headsUpGuestName(commitment),
    guestPhoneFallback: '',
    // Placeholders, like `recentContext: []` below: a commitment carries none of
    // TAC-473's three fields ("Heads-up commitments get none of these three" in
    // its Contract), so the channel and the window are genuinely unknown here.
    //
    // `'text'` is the value that CLAIMS LEAST. It renders no drain bar and no
    // timer pill, which is the honest output for "we don't know yet", and the
    // real row replaces all of this within a frame or two of the realtime
    // reload. `'instagram'` with a null deadline would render identically today
    // but asserts a channel nobody established. Neither ever reaches
    // `windowState`'s `closed` branch, so the decline draft stays sendable,
    // which it must be. (TAC-486.)
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    draftBody: declined.body,
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    // The server's row carries this code, and its label arrives with the row on
    // the realtime reload. The takeover's ground comes from the route's
    // `bucket`, not from here.
    reviewReasonCode: 'operator_decline_initiated',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    recognitionState: commitment.recognitionState,
    agentReasoning: null,
    pendingSinceMs: 0,
    recentContext: [],
    langfuseTraceId: null,
  };
}

export function stageDeclineHandoff(draft: PendingDraft): void {
  staged = draft;
}

export function peekDeclineHandoff(messageId: string | undefined): PendingDraft | null {
  if (!messageId || !staged) return null;
  return staged.messageId === messageId ? staged : null;
}

export function clearDeclineHandoff(messageId: string): void {
  if (staged?.messageId === messageId) staged = null;
}

// Test-only reset.
export function __resetDeclineHandoffForTests(): void {
  staged = null;
}
