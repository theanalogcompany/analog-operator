import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { MessageBubble } from '@/components/ui/message-bubble';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type HeadsUpCommitment, type ThreadMessage } from '@/lib/api/queue';
import {
  arrivalLabel,
  commitmentAgeMs,
  commitmentTypeLabel,
  headsUpGuestName,
  headsUpStripLabel,
  showsCodeChip,
} from '@/lib/heads-up';
import { formatProgress, stripColorFor } from '@/lib/review-bucket';
import { body as bodyType, card, typePresets } from '@/lib/theme';
import { computeItems, deviceTimezone } from '@/lib/thread-cluster';

import { cardShadow, formatPendingDuration } from './queue-card';
import { RecognitionBadge } from './recognition-badge';

/** How much of the conversation the card shows; the rest lives in Texts. */
export const HEADS_UP_THREAD_TAIL = 3;

type Props = {
  commitment: HeadsUpCommitment;
  /** Resolved by `resolveCardLayout`, same as a draft card. */
  height: number;
  /** The conversation behind the commitment, oldest first. Omitted on the peek. */
  thread?: readonly ThreadMessage[];
  /** Session progress for the strip's counter. Omitted on the peek. */
  position?: number;
  total?: number;
  /** The swipe washes, clipped to the card's corners. */
  overlay?: ReactNode;
  /** Injected so tests can pin "due now" against a fixed clock. */
  now?: Date;
};

/**
 * A heads-up card: a guest the agent promised something to is arriving.
 * (TAC-364, carrying TAC-298.)
 *
 * Built on the draft card's chassis (flag strip, head, bottom-anchored
 * conversation) so the two kinds read as one deck, with one structural
 * difference that is the whole point: there is NO COMPOSER. Where a draft card
 * ends in the message it would send, this card ends in the commitment itself,
 * captioned "Nothing sends either way", because nothing does. Acknowledging is
 * silent, and declining only starts a draft the operator reviews elsewhere.
 * Don't add a composer here: a card that looks sendable invites a swipe that
 * expects to send.
 */
export function HeadsUpCard({
  commitment,
  height,
  thread = [],
  position,
  total,
  overlay,
  now = new Date(),
}: Props) {
  const timezone = deviceTimezone();
  const name = headsUpGuestName(commitment);
  // Same day-boundary rule as the draft card and the edit screen. A
  // commitment's conversation often predates the arrival by a day or more, so
  // this tail crosses midnight more often than a draft card's. (TAC-408.)
  // `now` rather than the wall clock, so the separator reads the same clock as
  // the strip and the arrival label. They agree in production; a card deciding
  // two labels from two clocks is only ever a trap for a test.
  const items = computeItems(
    thread.slice(-HEADS_UP_THREAD_TAIL),
    timezone,
    now.getTime(),
  );
  const arrival = arrivalLabel(commitment.expected_arrival, now, timezone);
  const code = commitment.code?.trim() ?? '';
  const description = commitment.description.trim();

  return (
    // Two views for the same reason as the draft card: iOS cannot both cast a
    // shadow and clip its children on one layer.
    <View
      accessibilityLabel={`Heads-up for ${name}.`}
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
        {/* a. Flag strip: what kind of card this is, and when it is due. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 11,
            paddingHorizontal: card.regionInsetPx,
            backgroundColor: stripColorFor('headsUp'),
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
            {headsUpStripLabel(commitment, now, timezone)}
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

        {/* b. Head: who, and how long ago the promise was made. */}
        <View style={{ paddingHorizontal: card.regionInsetPx, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TrackedCaps {...typePresets.cardName} color="#1C1814">
              {name}
            </TrackedCaps>
            <RecognitionBadge state={commitment.recognitionState} variant="card" />
            <TrackedCaps
              {...typePresets.elapsed}
              color="#6F6658"
              style={{ marginLeft: 'auto' }}
            >
              {formatPendingDuration(commitmentAgeMs(commitment, now))}
            </TrackedCaps>
          </View>
        </View>

        {/* c. Conversation: the tail of the thread the commitment came from,
            bottom-anchored like the draft card's. */}
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
                <TrackedCaps {...typePresets.dateDivider} color="#6F6658">
                  {item.label}
                </TrackedCaps>
              </View>
            ) : (
              <MessageBubble
                key={item.key}
                direction={item.message.direction}
                body={item.message.body}
                surface="card"
              />
            ),
          )}
        </View>

        {/* d. The commitment, in the slot a draft card's composer takes. */}
        <View
          testID="heads-up-commitment"
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
                borderWidth: 1,
                borderColor: 'rgba(28,24,20,0.18)',
                borderRadius: 20,
                paddingVertical: 12,
                paddingHorizontal: 15,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TrackedCaps
                  {...typePresets.elapsed}
                  color="#A85638"
                  accessibilityLabel={
                    arrival === 'Now' ? 'Arriving now' : `Arriving ${arrival}`
                  }
                >
                  {arrival}
                </TrackedCaps>
                <TrackedCaps {...typePresets.badge} color="#6F6658">
                  {commitmentTypeLabel(commitment.type)}
                </TrackedCaps>
                {showsCodeChip(commitment) ? (
                  <View
                    testID="heads-up-code-chip"
                    style={{
                      marginLeft: 'auto',
                      borderWidth: 1,
                      borderColor: '#A85638',
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <TrackedCaps
                      {...typePresets.badge}
                      color="#A85638"
                      accessibilityLabel={`Code ${code}`}
                    >
                      {code}
                    </TrackedCaps>
                  </View>
                ) : null}
              </View>
              {description ? (
                <Text
                  allowFontScaling={false}
                  className="font-inter-tight"
                  // Capped so a long promise can't push the thread off a
                  // fixed-height card; the full text is in the thread itself.
                  numberOfLines={3}
                  style={{
                    marginTop: 6,
                    fontSize: bodyType.bubble.size,
                    lineHeight: bodyType.bubble.lineHeight,
                    color: '#1C1814',
                  }}
                >
                  {description}
                </Text>
              ) : null}
            </View>
            <TrackedCaps
              {...typePresets.composerCaption}
              color="#6F6658"
              style={{ marginTop: 9, textAlign: 'right' }}
            >
              Nothing sends either way
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
