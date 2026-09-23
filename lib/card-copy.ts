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
    /** "+2 more": the reasons the Also block held back. (TAC-388.) */
    more: 'more',
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
    /** The copy-and-open action could not finish. (TAC-486.) */
    noInstagramHandle: "We don't have this guest's Instagram handle yet.",
    /**
     * The copy worked and the open did not, so saying the draft is on the
     * clipboard is both true and the useful half.
     */
    instagramOpenFailed: "Couldn't open Instagram. The draft is on your clipboard.",
    /**
     * The COPY failed, so the clipboard sentence above would name the one thing
     * that did not happen. Separate string rather than a shared one.
     */
    instagramCopyFailed: "Couldn't copy the draft. Try again.",
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
  /**
   * Instagram's reply window. (TAC-486.)
   *
   * The timer labels themselves are built in `lib/reply-window.ts`, because
   * they interpolate a number; everything fixed lives here.
   */
  replyWindow: {
    /** The expired card's flag strip, in place of the bucket's name. */
    strip: 'Reply window closed',
    /**
     * The expired card's one action. Names both halves of what it does, because
     * the operator has to paste once they arrive: nothing prefills on Instagram.
     */
    copyAction: 'Copy and open Instagram',
    /**
     * Beside the copy action, on EVERY expired card.
     *
     * Ruled 2026-09-23 (option B): copying an expired draft stays text-only and
     * the card says so rather than shipping silent. Deliberately NOT keyed to
     * the obligation bucket. TAC-401 measured the agent promising in prose with
     * no carrier in 20 of 60 replies, with the comp regex catching none, so a
     * notice that appeared only on flagged cards would teach the operator that
     * its absence means "this one is safe" and be wrong a third of the time.
     * One always-true line cannot mislead.
     *
     * Not the caption design resolution 1 dropped: "Nothing sends from analog"
     * repeated the body line, while this says something new and actionable.
     */
    copyRecordsNothing:
      "Copying doesn't record anything here. If this promises the guest something, make a note yourself.",
    /**
     * Shown when a swipe is cancelled because the window shut under the
     * operator's hands. Ruled 2026-09-23: the card converts the moment it
     * expires, and a gesture in flight is cancelled and explained.
     */
    closedMidSwipe:
      'The reply window closed. Copy the draft and send it from Instagram.',
    /** VoiceOver, on the handle link. `{handle}` is replaced with "@name". */
    openInInstagram: 'Open {handle} in Instagram',
    /** The channel glyph's accessibility label. */
    instagram: 'Instagram',
  },
  /** A guest with no name, no handle and no phone. (TAC-486.) */
  guestFallback: {
    /**
     * Deliberately not "Unknown guest", which reads as an error rather than as
     * a guest nobody has named yet. Until TAC-479's handle fetch lands an
     * Instagram guest can genuinely be a bare scoped id.
     */
    instagram: 'Instagram guest',
    text: 'Guest',
  },
  /** Above the text a regen replaced. (TAC-402, via TAC-397's `replacedDraft`.) */
  replacedDraft: 'What this replaced',
} as const;
