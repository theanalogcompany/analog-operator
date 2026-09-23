import { type ReactNode } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';

import { MessageBubble } from '@/components/ui/message-bubble';
import { SendGlyph } from '@/components/ui/send-glyph';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { useNow } from '@/hooks/use-now';
import { type PendingDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { EXPIRED_STRIP_COLOR } from '@/lib/grounds';
import { type GuestIdentity, guestFirstName, guestIdentity } from '@/lib/guest-identity';
import { type SubQueuePosition } from '@/lib/sub-queue';
import { closedAgoPhrase, windowState } from '@/lib/reply-window';
import {
  bucketForDraft,
  formatProgress,
  stripColorFor,
  stripLabelForDraft,
} from '@/lib/review-bucket';
import { body as bodyType, card, replyWindow, typePresets } from '@/lib/theme';
import { computeItems, deviceTimezone } from '@/lib/thread-cluster';

import { ExpiredComposer } from './expired-composer';
import { CardHead } from './card-head';
import { ReplyWindowBar } from './reply-window-bar';
import { SubQueueRow } from './sub-queue-row';
import { ReviewDetail } from './review-detail';

/**
 * Who the card is for. One chain for every surface (`lib/guest-identity.ts`),
 * which is also what stops an unnamed Instagram guest rendering blank: their
 * `guestPhoneFallback` is `''`, and `??` does not fall back on an empty string.
 */
function identityFor(draft: PendingDraft): GuestIdentity {
  return guestIdentity({
    displayName: draft.guestDisplayName,
    instagramUsername: draft.instagramUsername,
    phoneFallback: draft.guestPhoneFallback,
    channel: draft.guestChannel,
  });
}

/** "just now" / "4 min" / "2 hrs". Shared with the heads-up card's head. */
export function formatPendingDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours > 1 ? 's' : ''}`;
}

function minutesPending(draft: PendingDraft): string {
  return formatPendingDuration(draft.pendingSinceMs);
}

type Props = {
  draft: PendingDraft;
  /**
   * Fires the expired card's one action: put the draft on the clipboard and
   * open the guest's Instagram thread. Absent on a peek render, where the card
   * is scenery and nothing on it is pressable.
   */
  onCopyAndOpen?: () => void;
  /**
   * Reports the handle link's frame, so the stack can hit-test a tap against
   * it. Passed on a LIVE card, where the link cannot be a real `Pressable`
   * without killing the pan (CLAUDE.md, TAC-37).
   */
  onHandleLayout?: (event: LayoutChangeEvent) => void;
  /** Passed instead where no `GestureDetector` is above the card. */
  onPressHandle?: () => void;
  /**
   * Where this card sits among the guest's other cards, or null when it is
   * their only one. Derived from the deck by `lib/sub-queue.ts`.
   */
  subQueueSpot?: SubQueuePosition | null;
  /** Resolved by `resolveCardLayout` — fixed, so every card in the deck is
   *  the same size regardless of how many messages it holds. */
  height: number;
  /** Session progress, for the flag strip's "01 / 04". Omitted on peek/preview
   *  renders, which show no counter. */
  position?: number;
  total?: number;
  /**
   * Reports the composer's frame in card-local coordinates. The stack uses it
   * to hit-test taps, because the composer cannot be a `Pressable`: a Pressable
   * inside a GestureDetector wins the responder race and kills the pan
   * outright (CLAUDE.md / TAC-37).
   */
  onComposerLayout?: (event: LayoutChangeEvent) => void;
  /** Rendered above the card content, clipped to its rounded corners — the
   *  swipe washes. */
  overlay?: ReactNode;
};

/**
 * `0 26px 64px rgba(20,17,14,0.42)` — a large, soft lift off the gradient.
 *
 * `boxShadow` rather than the `shadowColor`/`shadowRadius` quartet: those are
 * iOS-only, and the Android fallback (`elevation`) renders a tight dark line
 * that reads as a border, not a lift. RN has supported cross-platform
 * `boxShadow` since 0.76 and this project is on 0.81, so the quartet has
 * nothing left to offer. Keep it as one string — mixing the two APIs on the
 * same view double-draws on iOS.
 */
export const cardShadow = {
  boxShadow: '0px 26px 64px rgba(20,17,14,0.42)',
} as const;

export function QueueCard({
  draft,
  height,
  position,
  total,
  onComposerLayout,
  onCopyAndOpen,
  onHandleLayout,
  onPressHandle,
  subQueueSpot = null,
  overlay,
}: Props) {
  const bucket = bucketForDraft(draft);
  const identity = identityFor(draft);
  const name = identity.name;

  // One clock for every timer on screen, ticking once a minute (never once a
  // second) and refreshed on foreground. See hooks/use-now.ts.
  //
  // The window is recomputed on every tick, INCLUDING the transition to
  // expired, which therefore happens under the operator's eyes rather than
  // waiting for them to leave the card. Ruled 2026-09-23: truth beats
  // stability here, because the alternative is a card that still looks
  // sendable after the deadline and a swipe that fails at the server. The
  // client's 5 minute display margin is what makes that safe, since roughly
  // five real minutes of window remain at the moment it converts.
  const window = windowState({
    expiresAt: draft.replyWindowExpiresAt,
    channel: draft.guestChannel,
    nowMs: useNow(),
  });
  const expired = window.kind === 'closed';

  // The card surface stays WHITE when the window shuts. What changes is the
  // ink and the chrome, so the thread and the draft stay readable and
  // selectable: the draft is still good, it just has to go out from Instagram.
  const metaInk = expired ? replyWindow.expired.metaInk : '#6F6658';

  // A blank draftBody is a real server state (the agent declined to draft, or
  // the row landed before generation finished). The design gives it its own
  // card: dimmed send glyph, different caption, and swipe-right disabled.
  //
  // Placeholder wording is fixed by the TAC-309 Contract. It deliberately says
  // nothing about drafts: a draft is our machinery, not the operator's mental
  // model — they never asked for one and don't know one was meant to exist.
  // From their side a guest asked something and it's their turn. Don't
  // "improve" this into app-state language. (TAC-310.)
  const hasDraft = draft.draftBody.trim().length > 0;

  // The excerpt runs through the same day-boundary rule as the edit screen, so
  // an excerpt that crosses midnight labels both days instead of filing this
  // morning's message under yesterday. Bubble positions come back unused: the
  // card doesn't chain its bubbles. (TAC-408.)
  const items = computeItems(draft.recentContext, deviceTimezone());
  const reasoning = draft.agentReasoning?.trim();

  return (
    // Two views, deliberately. iOS cannot both cast a shadow and clip its
    // children on the same layer — with `overflow: hidden` and a shadow on one
    // view, the clip stops applying at the corners and the white card showed
    // through as wedges either side of the flag strip. So the outer view owns
    // the shadow and the inner one owns the clip.
    <View
      accessibilityLabel={`Pending draft for ${name}.`}
      style={[
        { width: '100%', height, borderRadius: card.radiusPx },
        cardShadow,
      ]}
    >
      <View
        style={{
          flex: 1,
          borderRadius: card.radiusPx,
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
          flexDirection: 'column',
        }}
      >
      {/* a. Flag strip: what kind of decision this is, named in caps. Why it
          was held is the sentence in the head, in sentence case. (TAC-364.) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 11,
          paddingHorizontal: card.regionInsetPx,
          // An expired card leaves its bucket colour with the rest of its
          // status: it has left play, so the strip goes to ink and says so.
          backgroundColor: expired ? EXPIRED_STRIP_COLOR : stripColorFor(bucket),
          // Matches the card's own corners rather than relying solely on the
          // parent's clip.
          borderTopLeftRadius: card.radiusPx,
          borderTopRightRadius: card.radiusPx,
        }}
      >
        <TrackedCaps
          {...typePresets.flagReason}
          color="#FFFFFF"
          numberOfLines={2}
          style={{ flex: 1 }}
        >
          {expired ? CARD_COPY.replyWindow.strip : stripLabelForDraft(draft)}
        </TrackedCaps>
        {position !== undefined && total !== undefined ? (
          <TrackedCaps
            {...typePresets.flagCounter}
            color="rgba(255,255,255,0.6)"
            accessibilityLabel={`Card ${position} of ${total}`}
          >
            {formatProgress(position, total)}
          </TrackedCaps>
        ) : null}
      </View>

      {/* Instagram's reply window, draining left to right. Directly under the
          strip and above the head, inside the card's clip. Renders nothing on a
          text card, or on an Instagram card whose window nobody measured. */}
      <ReplyWindowBar state={window} />

      {/* b. Head — who, and what the agent made of it. No hairline beneath:
          with a fixed-height card and a bottom-anchored thread, a rule here
          would point at empty space. */}
      <View
        style={{ paddingHorizontal: card.regionInsetPx, paddingTop: 20 }}
      >
        <CardHead
          identity={identity}
          recognitionState={draft.recognitionState}
          window={window}
          expired={expired}
          elapsedLabel={minutesPending(draft)}
          onHandleLayout={onHandleLayout}
          onPressHandle={onPressHandle}
        />
        {/* C1: shown only when the deck holds more than one card for this
            guest. Above the reason, so the operator knows this is one of a set
            before they read what it is about. */}
        {subQueueSpot ? (
          <SubQueueRow
            spot={subQueueSpot}
            guestName={guestFirstName(identity)}
          />
        ) : null}
        {expired ? (
          // A4: the window explanation REPLACES the held-reason on an expired
          // card. Why it was held stopped being the operator's next move the
          // moment it stopped being sendable from here; what to do about it is.
          <Text
            allowFontScaling={false}
            testID="expired-reason"
            className="font-inter-tight"
            style={{
              marginTop: 12,
              fontSize: bodyType.reasoning.size,
              lineHeight: bodyType.reasoning.lineHeight,
              color: metaInk,
            }}
          >
            {`Instagram stopped accepting replies ${closedAgoPhrase(
              window.kind === 'closed' ? window.closedForMs : 0,
            )}. The draft is still good, it just has to go out from Instagram.`}
          </Text>
        ) : (
          <ReviewDetail draft={draft} surface="card" style={{ marginTop: 12 }} />
        )}
        {reasoning && !expired ? (
          <Text
        allowFontScaling={false}
            accessibilityLabel="Agent reasoning"
            className="font-inter-tight"
            style={{
              marginTop: 12,
              fontSize: bodyType.reasoning.size,
              lineHeight: bodyType.reasoning.lineHeight,
              color: metaInk,
            }}
          >
            {reasoning}
          </Text>
        ) : null}
      </View>

      {/* c. Conversation — bottom-anchored, so the last message always sits
          directly above the composer and the slack collects as air under the
          head. Overflow is clipped, not scrolled: the full thread lives in the
          edit takeover. */}
      <View
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          justifyContent: 'flex-end',
          gap: card.bubbleGapPx,
          paddingHorizontal: card.regionInsetPx,
          paddingBottom: 4,
        }}
      >
        {items.map((item) =>
          item.kind === 'timestamp' ? (
            <View
              key={item.key}
              style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 10 }}
            >
              <TrackedCaps {...typePresets.dateDivider} color={metaInk}>
                {item.label}
              </TrackedCaps>
            </View>
          ) : (
            <MessageBubble
              key={item.key}
              direction={item.message.direction}
              body={item.message.body}
              surface={expired ? 'expiredCard' : 'card'}
            />
          ),
        )}
      </View>

      {/* d. Composer — a preview of the draft, not an input. Tapping it opens
          the edit takeover; the tap is hoisted into the stack's gesture.

          Once the window has shut it is replaced outright by the copy block:
          there is nothing left to send from here, and a composer that still
          looked like one would invite a swipe that cannot work. */}
      {expired ? (
        <ExpiredComposer
          draftBody={draft.draftBody}
          onCopyAndOpen={onCopyAndOpen ?? (() => {})}
        />
      ) : (
      <View
        testID="queue-card-composer"
        onLayout={onComposerLayout}
        style={{ paddingHorizontal: card.regionInsetPx, paddingBottom: 20 }}
      >
        <View
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: 'rgba(28,24,20,0.10)',
          }}
        >
          <View
            style={{
              position: 'relative',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(28,24,20,0.18)',
              borderRadius: 20,
              minHeight: 42,
              paddingTop: 11,
              paddingBottom: 11,
              paddingLeft: 15,
              paddingRight: 48,
            }}
          >
            <Text
        allowFontScaling={false}
              className="font-inter-tight"
              style={{
                fontSize: bodyType.bubble.size,
                lineHeight: bodyType.bubble.lineHeight,
                color: hasDraft ? '#1C1814' : '#6F6658',
              }}
            >
              {hasDraft
                ? draft.draftBody
                : 'Type your answer to send to the guest'}
            </Text>
            <View style={{ position: 'absolute', right: 6, bottom: 6 }}>
              <SendGlyph size={30} opacity={hasDraft ? 1 : 0.3} />
            </View>
          </View>
          <TrackedCaps
            {...typePresets.composerCaption}
            color={hasDraft ? '#A85638' : '#6F6658'}
            style={{ marginTop: 9, textAlign: 'right' }}
          >
            {hasDraft ? CARD_COPY.composer.hasDraft : CARD_COPY.composer.noDraft}
          </TrackedCaps>
        </View>
      </View>
      )}

        {overlay ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            {overlay}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * What to call this guest, as one string.
 *
 * Kept as a named export because the edit takeover's header and the undo toast
 * both name a guest and both carried the same `?? phoneFallback` bug: routing
 * them through `identityFor` fixes the blank name on those two surfaces as
 * well, rather than only on the card.
 */
function displayName(draft: PendingDraft): string {
  return identityFor(draft).name;
}

export {
  displayName as queueCardDisplayName,
  identityFor as queueCardIdentity,
  minutesPending as queueCardMinutesPending,
};
