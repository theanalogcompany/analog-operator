import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { type ThreadMessage, getThread } from '@/lib/api/queue';

import { CodeChip } from './code-chip';
import { FlaggedBecause } from './flagged-because';
import { RecognitionBadge } from './recognition-badge';

function ageLabel(commitment: HeadsUpCommitment, now: number = Date.now()): string {
  const createdMs = Date.parse(commitment.createdAt);
  if (Number.isNaN(createdMs)) return 'just now';
  const minutes = Math.max(0, Math.floor((now - createdMs) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours > 1 ? 's' : ''}`;
}

function displayName(commitment: HeadsUpCommitment): string {
  const trimmed = commitment.guestName.trim();
  return trimmed.length > 0 ? trimmed : 'a guest';
}

type Props = {
  commitment: HeadsUpCommitment;
};

const cardOuterClass =
  'overflow-hidden rounded-[20px] border-[0.5px] border-hairline bg-white';

const cardShadow = {
  shadowColor: '#1C1814',
  shadowOpacity: 0.1,
  shadowOffset: { width: 0, height: 8 },
  shadowRadius: 24,
  elevation: 6,
} as const;

export function HeadsUpCard({ commitment }: Props) {
  // Inline-context bubble: the SINGLE inbound that triggered the commitment
  // (the row whose id === sourceMessageId). NOT the full thread —
  // `getThread()` returns the entire conversation (TAC-277), which on a real
  // pilot guest is dozens of bubbles spanning days, and rendering all of
  // them inline made the card a screen-dominating wall of message bubbles
  // that the operator mistook for the edit screen having auto-navigated.
  // The point of `sourceMessageId` (TAC-299) is to surface THAT specific
  // message — "here's what the guest said that flagged this" — not to
  // re-render the conversation view. If the source message isn't in the
  // response (server drift, deleted row), render no thread block at all
  // and let FlaggedBecause + CodeChip carry the context. (TAC-298 UAT #2.)
  const [contextMessage, setContextMessage] = useState<ThreadMessage | null>(null);
  const { sourceMessageId } = commitment;

  useEffect(() => {
    if (!sourceMessageId) return;
    let cancelled = false;
    void (async () => {
      const result = await getThread(sourceMessageId);
      if (cancelled) return;
      if (result.ok) {
        const source = result.data.find((m) => m.id === sourceMessageId) ?? null;
        setContextMessage(source);
      }
      // On error: leave thread empty (degrades gracefully — the rest of the
      // card still renders). Uniform with the edit screen's getThread
      // fallback path.
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceMessageId]);

  const name = displayName(commitment);
  const a11yLabel = `Heads-up for ${name}: ${commitment.type}.`;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
      className={cardOuterClass}
      style={cardShadow}
    >
      <View className="flex-row items-center gap-[10px] px-[18px] pb-[14px] pt-[18px]">
        <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 15 }}>
          {name}
        </Text>
        <RecognitionBadge state={commitment.recognitionState} />
        <Text
          className="ml-auto font-inter-tight text-ink-faint"
          style={{ fontSize: 11, letterSpacing: 0.44 }}
        >
          {ageLabel(commitment)}
        </Text>
      </View>

      <FlaggedBecause
        type={commitment.type}
        description={commitment.description}
        expectedArrival={commitment.expectedArrival}
        guestName={commitment.guestName}
      />

      {commitment.code !== null ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
          <CodeChip code={commitment.code} />
        </View>
      ) : null}

      <View className="h-[0.5px] bg-hairline" style={{ marginHorizontal: 18 }} />

      {contextMessage !== null ? (
        <View className="flex-col gap-[6px] px-[18px] pb-[6px] pt-[14px]">
          <View
            className={
              contextMessage.direction === 'inbound'
                ? 'self-start rounded-[18px] bg-inbound'
                : 'self-end rounded-[18px] border-[0.5px] border-hairline bg-paper'
            }
            style={{
              maxWidth: '86%',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderBottomLeftRadius: contextMessage.direction === 'inbound' ? 6 : 18,
              borderBottomRightRadius:
                contextMessage.direction === 'outbound' ? 6 : 18,
            }}
          >
            <Text
              className="font-inter-tight"
              style={{
                color: contextMessage.direction === 'inbound' ? '#F0EDE7' : '#1C1814',
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {contextMessage.body}
            </Text>
          </View>
        </View>
      ) : null}

      {/* "No action needed" resting state occupies the compose slot — the
          disabled send affordance is the visual cue that swipe-right has
          nothing to send. The send-button shape mirrors the draft card so
          the swipe-action UI stays consistent. */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 14, gap: 12 }}
      >
        <Text
          accessibilityLabel={`No action needed — Analog already confirmed with ${name}`}
          className="font-fraunces flex-1 text-ink-soft"
          style={{ fontSize: 14, lineHeight: 20 }}
        >
          No action needed — Analog already confirmed with {name}.
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: '#D8CFC0',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.5,
          }}
        >
          <Feather name="send" size={14} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

export { displayName as headsUpCardDisplayName, ageLabel as headsUpCardAgeLabel };
