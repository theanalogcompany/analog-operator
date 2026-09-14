/**
 * Fixed strings the queue card, the heads-up card and the edit takeover show,
 * gathered so one test can walk them: the strip labels, the review detail's
 * prefixes, the composer captions, the toasts and the swipe hints' spoken
 * labels. Not every string on those surfaces lives here yet; the source scan in
 * the same test covers the ones that don't.
 *
 * No em dashes (ruled 2026-09-14, TAC-364). Cards are read fast on a phone
 * mid-shift, and an em dash is a pause the reader has to parse; a full stop, a
 * comma or the strip's middle dot is not. `__tests__/lib/card-copy.test.ts`
 * walks every value here, and a source scan over the card surfaces catches a
 * string written inline instead of added here. Text the server supplies (the
 * reason sentence, trigger labels, flagged claims) is held to the same rule by
 * analog-guest's own test over its label map. Push notification bodies are a
 * different surface and are not covered.
 */
export const CARD_COPY = {
  /** The flag strip's caps label: what kind of decision the card is. */
  strip: {
    obligation: 'Obligation',
    outsideDraft: 'Outside the draft',
    draftWrong: 'Draft came out wrong',
    midThread: 'Mid-thread',
    /** A reason code this app doesn't know. Never a bucket's name. */
    unrecognised: 'Needs review',
    /** A heads-up card, and the takeover a decline opens. */
    commitment: 'Commitment',
  },
  /** Inline caps prefixes in the review detail. */
  detail: {
    also: 'Also',
    couldntVerify: "Couldn't verify",
  },
  composer: {
    hasDraft: 'Draft · swipe right to send',
    noDraft: 'Nothing drafted · swipe left to write',
  },
  toast: {
    nothingToSend: 'Nothing to send yet. Swipe left to write your answer.',
    sendFailed: "Couldn't send. Tap to retry.",
    skipFailed: "Couldn't skip. Tap to retry.",
    acknowledgeFailed: "Couldn't acknowledge that. Try again.",
    declineWriting: 'Writing the decline…',
    declineFailed: "Couldn't write the decline. Try again.",
    alreadyHandled: 'That one was already handled.',
  },
  /** What VoiceOver announces for the swipe hints. */
  hints: {
    edit: 'Swipe left to edit',
    write: 'Swipe left to write',
    send: 'Swipe right to send',
    sendUnavailable: 'Swipe right to send, unavailable. Nothing drafted.',
    decline: 'Swipe left to decline',
    acknowledge: 'Swipe right to acknowledge',
  },
} as const;
