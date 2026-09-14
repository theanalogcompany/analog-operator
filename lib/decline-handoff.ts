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
    draftBody: declined.body,
    category: null,
    voiceFidelity: null,
    reviewReason: null,
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
