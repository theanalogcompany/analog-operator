import { type ReactNode } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';

import { MessageBubble } from '@/components/ui/message-bubble';
import { SendGlyph } from '@/components/ui/send-glyph';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type PendingDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import {
  bucketForDraft,
  formatProgress,
  stripColorFor,
  stripLabelForDraft,
} from '@/lib/review-bucket';
import { body as bodyType, card, typePresets } from '@/lib/theme';
import { deviceTimezone, formatDayDivider } from '@/lib/thread-cluster';

import { RecognitionBadge } from './recognition-badge';
import { ReviewDetail } from './review-detail';

function displayName(draft: PendingDraft): string {
  if (draft.guestDisplayName && draft.guestDisplayName.trim().length > 0) {
    return draft.guestDisplayName;
  }
  return draft.guestPhoneFallback;
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
  overlay,
}: Props) {
  const bucket = bucketForDraft(draft);
  const name = displayName(draft);

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

  const thread = draft.recentContext;
  const firstMessage = thread[0];
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
          backgroundColor: stripColorFor(bucket),
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
          {stripLabelForDraft(draft)}
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

      {/* b. Head — who, and what the agent made of it. No hairline beneath:
          with a fixed-height card and a bottom-anchored thread, a rule here
          would point at empty space. */}
      <View
        style={{ paddingHorizontal: card.regionInsetPx, paddingTop: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TrackedCaps {...typePresets.cardName} color="#1C1814">
            {name}
          </TrackedCaps>
          <RecognitionBadge state={draft.recognitionState} variant="card" />
          <TrackedCaps
            {...typePresets.elapsed}
            color="#6F6658"
            style={{ marginLeft: 'auto' }}
          >
            {minutesPending(draft)}
          </TrackedCaps>
        </View>
        <ReviewDetail draft={draft} surface="card" style={{ marginTop: 12 }} />
        {reasoning ? (
          <Text
        allowFontScaling={false}
            accessibilityLabel="Agent reasoning"
            className="font-inter-tight"
            style={{
              marginTop: 12,
              fontSize: bodyType.reasoning.size,
              lineHeight: bodyType.reasoning.lineHeight,
              color: '#6F6658',
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
        {firstMessage ? (
          <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 10 }}>
            <TrackedCaps {...typePresets.dateDivider} color="#6F6658">
              {formatDayDivider(firstMessage.createdAt, deviceTimezone())}
            </TrackedCaps>
          </View>
        ) : null}
        {thread.map((message) => (
          <MessageBubble
            key={message.id}
            direction={message.direction}
            body={message.body}
            surface="card"
          />
        ))}
      </View>

      {/* d. Composer — a preview of the draft, not an input. Tapping it opens
          the edit takeover; the tap is hoisted into the stack's gesture. */}
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

export {
  displayName as queueCardDisplayName,
  minutesPending as queueCardMinutesPending,
};
