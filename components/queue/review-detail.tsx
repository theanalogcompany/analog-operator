import { useState } from 'react';
import { type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { type PendingDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { planAlsoLines, secondaryTriggerLabels } from '@/lib/review-bucket';
import { body as bodyType, reviewDetail, typePresets } from '@/lib/theme';

type Surface = 'card' | 'takeover';

type Palette = {
  reason: string;
  detail: string;
  also: string;
  verify: string;
};

/** Ink on the white card. White on the takeover, where it sits on the ground. */
const PALETTES: Record<Surface, Palette> = {
  card: { reason: '#1C1814', detail: '#6F6658', also: '#6F6658', verify: '#A85638' },
  takeover: { reason: '#FFFFFF', detail: '#FFFFFF', also: '#FFFFFF', verify: '#FFFFFF' },
};

type Props = {
  draft: PendingDraft;
  surface: Surface;
  style?: StyleProp<ViewStyle>;
};

/**
 * Why a draft is held, under the guest's name. (TAC-364.)
 *
 * Three parts, each rendered only when there is something to say:
 *
 * 1. The reason: the server's sentence for the primary trigger, in sentence
 *    case. The strip above already names the kind of decision in caps; running
 *    the sentence through caps too is how a card came to read "FLAGGED — THIS
 *    OFFERS SOMETHING FREE — YOUR CALL."
 * 2. "Also": the other triggers that fired, in server order, primary excluded
 *    (see `secondaryTriggerLabels`), one reason per row beside the caps
 *    prefix. Run together as one paragraph, two reasons read as one thought.
 *    A reason that doesn't fit is withheld and counted, never cut off
 *    mid-sentence (see `planAlsoLines`). (TAC-388.)
 * 3. "Couldn't verify": the claims the grounding check flagged, verbatim.
 *
 * On the card every line comes out of the thread; on the takeover every line
 * counts against what Honey can hold (see `reviewDetail` in lib/theme.ts).
 */
export function ReviewDetail({ draft, surface, style }: Props) {
  const reason = draft.reviewReason?.trim() ?? '';
  const also = secondaryTriggerLabels(draft);
  const claims = draft.ungroundedClaims
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0);

  // How many lines each reason needs at this surface's width, reported by the
  // hidden measuring copies below. Keyed on the labels, so a different draft
  // starts unmeasured instead of borrowing another draft's counts.
  const alsoKey = also.join('\n');
  const unmeasured = (): (number | null)[] => also.map(() => null);
  const [measured, setMeasured] = useState<{ key: string; lineCounts: (number | null)[] }>(
    () => ({ key: alsoKey, lineCounts: unmeasured() }),
  );

  if (!reason && also.length === 0 && claims.length === 0) return null;

  const caps = reviewDetail[surface];
  const palette = PALETTES[surface];
  const line = {
    fontSize: bodyType.reasoning.size,
    lineHeight: reviewDetail.lineHeightPx,
  };
  const prefix = {
    fontSize: typePresets.composerCaption.size,
    letterSpacing: typePresets.composerCaption.tracking,
  };
  const claimsText = claims.map((claim) => `“${claim}”`).join(' ');
  const plan = planAlsoLines({
    labels: also,
    lineCounts: measured.key === alsoKey ? measured.lineCounts : unmeasured(),
    maxItems: caps.alsoItems,
    maxLinesPerItem: caps.alsoItemLines,
  });

  const recordLines = (index: number, lines: number): void => {
    setMeasured((prev) => {
      const current = prev.key === alsoKey ? prev.lineCounts : unmeasured();
      if (prev.key === alsoKey && current[index] === lines) return prev;
      const next = current.slice();
      next[index] = lines;
      return { key: alsoKey, lineCounts: next };
    });
  };

  return (
    <View style={[{ gap: reviewDetail.gapPx }, style]}>
      {reason ? (
        <Text
          allowFontScaling={false}
          testID="review-detail-reason"
          numberOfLines={caps.reasonLines}
          className="font-inter-tight"
          style={{ ...line, color: palette.reason }}
        >
          {reason}
        </Text>
      ) : null}
      {also.length > 0 ? (
        <View
          testID="review-detail-also"
          accessible
          // Every reason in full, including any the block holds back, and in
          // sentence case: VoiceOver can spell a short caps word out letter by
          // letter.
          accessibilityLabel={`${CARD_COPY.detail.also}: ${also.join(' ')}`}
          // Invisible, not absent, until measured: the reasons column needs its
          // real width for the measuring copies to report real line counts.
          // Baseline, so the smaller caps prefix sits on the first reason's line
          // the way the inline "Couldn't verify" prefix does below.
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: reviewDetail.alsoPrefixGapPx,
            opacity: plan ? 1 : 0,
          }}
        >
          <Text
            allowFontScaling={false}
            className="font-inter-tight-medium"
            style={{ ...prefix, lineHeight: reviewDetail.lineHeightPx, color: palette.also }}
          >
            {CARD_COPY.detail.also.toUpperCase()}
          </Text>
          <View style={{ flex: 1 }}>
            <View
              // Keyed on the labels, so every copy remounts and reports again
              // when they change. Fabric drops an onTextLayout whose lines match
              // the last one it sent, so a reused copy would stay silent, its
              // count null, and the block invisible.
              key={alsoKey}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 }}
            >
              {also.map((label, index) => (
                <Text
                  key={`${index}:${label}`}
                  testID="review-detail-also-measure"
                  allowFontScaling={false}
                  className="font-inter-tight"
                  style={line}
                  onTextLayout={(event) => recordLines(index, event.nativeEvent.lines.length)}
                >
                  {label}
                </Text>
              ))}
            </View>
            {plan?.shown.map((label, index) => (
              <Text
                key={`${index}:${label}`}
                testID="review-detail-also-item"
                allowFontScaling={false}
                numberOfLines={caps.alsoItemLines}
                className="font-inter-tight"
                style={{ ...line, color: palette.detail }}
              >
                {label}
              </Text>
            ))}
            {plan && plan.hidden > 0 ? (
              <Text
                testID="review-detail-also-more"
                allowFontScaling={false}
                numberOfLines={1}
                className="font-inter-tight-medium"
                style={{ ...line, color: palette.detail }}
              >
                {`+${plan.hidden} ${CARD_COPY.detail.more}`}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {claims.length > 0 ? (
        <Text
          allowFontScaling={false}
          testID="review-detail-claims"
          accessibilityLabel={`${CARD_COPY.detail.couldntVerify}: ${claimsText}`}
          numberOfLines={caps.claimLines}
          className="font-inter-tight"
          style={{ ...line, color: palette.reason }}
        >
          <Text
            allowFontScaling={false}
            className="font-inter-tight-medium"
            style={{ ...prefix, color: palette.verify }}
          >
            {`${CARD_COPY.detail.couldntVerify.toUpperCase()}  `}
          </Text>
          {claimsText}
        </Text>
      ) : null}
    </View>
  );
}
