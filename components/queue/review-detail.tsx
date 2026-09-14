import { type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { type PendingDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { secondaryTriggerLabels } from '@/lib/review-bucket';
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
 *    (see `secondaryTriggerLabels`).
 * 3. "Couldn't verify": the claims the grounding check flagged, verbatim.
 *
 * The two labels are inline prefixes rather than lines of their own, so each
 * part costs only its own lines. On the card every line comes out of the
 * thread; on the takeover every line counts against what Honey can hold (see
 * `reviewDetail` in lib/theme.ts).
 */
export function ReviewDetail({ draft, surface, style }: Props) {
  const reason = draft.reviewReason?.trim() ?? '';
  const also = secondaryTriggerLabels(draft);
  const claims = draft.ungroundedClaims
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0);
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
  const alsoText = also.join(' ');
  const claimsText = claims.map((claim) => `“${claim}”`).join(' ');

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
        <Text
          allowFontScaling={false}
          testID="review-detail-also"
          // Announced in sentence case: VoiceOver can spell a short caps word
          // out letter by letter.
          accessibilityLabel={`${CARD_COPY.detail.also}: ${alsoText}`}
          numberOfLines={caps.alsoLines}
          className="font-inter-tight"
          style={{ ...line, color: palette.detail }}
        >
          <Text
            allowFontScaling={false}
            className="font-inter-tight-medium"
            style={{ ...prefix, color: palette.also }}
          >
            {`${CARD_COPY.detail.also.toUpperCase()}  `}
          </Text>
          {alsoText}
        </Text>
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
