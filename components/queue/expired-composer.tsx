import { Pressable, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { CARD_COPY } from '@/lib/card-copy';
import { body as bodyType, card, replyWindow, typePresets } from '@/lib/theme';

type Props = {
  draftBody: string;
  onCopyAndOpen: () => void;
};

/** The copy glyph on the button. Two offset rounded rectangles, 2px stroke. */
function CopyGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={9}
        y={9}
        width={13}
        height={13}
        rx={2}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * What replaces the composer once the reply window has shut (TAC-486, A4).
 *
 * The draft stays visible and selectable in a dashed box: it is still good, it
 * simply has to go out from somewhere else, and the operator may want to read
 * it before they send it. The one action copies it and opens the guest's
 * thread. Nothing here can send.
 *
 * **The line under the button is on EVERY expired card, not only ones that look
 * like a commitment.** Ruled 2026-09-23 (option B): copying stays text-only and
 * the card says so. It is not gated on the obligation bucket because TAC-401
 * measured the agent promising in prose with no carrier in 20 of 60 replies,
 * with the comp regex catching none — a notice that appeared only on flagged
 * cards would teach the operator that its absence means "this one is safe" and
 * be wrong a third of the time.
 *
 * Design resolution 1 dropped the "NOTHING SENDS FROM ANALOG" caption and the
 * toast, because the body line already said that. This line is not that one: it
 * says something new, about what the button does to the ledger rather than
 * about sending.
 *
 * This is a real `Pressable`, which is only safe because an expired card is
 * rendered OUTSIDE the `GestureDetector` (see `queue-card-stack.tsx`). A
 * Pressable inside one wins RN's responder race and kills both the pan and the
 * tap (CLAUDE.md, TAC-37).
 */
export function ExpiredComposer({ draftBody, onCopyAndOpen }: Props) {
  return (
    <View
      testID="expired-composer"
      style={{
        paddingHorizontal: card.regionInsetPx,
        paddingBottom: 20,
      }}
    >
      <View
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: replyWindow.expired.rule,
        }}
      >
        {/* Dashed, not solid: an input-looking box invites typing, and there is
            nothing here to type into. */}
        <View
          style={{
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: replyWindow.expired.draftBoxBorder,
            borderRadius: replyWindow.expired.draftBoxRadiusPx,
            paddingVertical: 12,
            paddingHorizontal: 15,
          }}
        >
          <Text
            allowFontScaling={false}
            selectable
            className="font-inter-tight"
            style={{
              fontSize: bodyType.bubble.size,
              lineHeight: bodyType.bubble.lineHeight,
              color: replyWindow.expired.draftInk,
            }}
          >
            {draftBody}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CARD_COPY.replyWindow.copyAction}
          accessibilityHint={CARD_COPY.replyWindow.copyRecordsNothing}
          onPress={onCopyAndOpen}
          testID="copy-and-open-instagram"
          // Object form, NOT `({ pressed }) => ...`. The function form is
          // dropped on device and takes the pill, the fill and the padding with
          // it. See the CLAUDE.md gotcha before changing this back.
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: replyWindow.expired.buttonRadiusPx,
            backgroundColor: replyWindow.expired.buttonBg,
          }}
        >
          <CopyGlyph size={replyWindow.expired.iconSizePx} color="#FFFFFF" />
          <TrackedCaps {...typePresets.copyAction} color="#FFFFFF" decorative>
            {CARD_COPY.replyWindow.copyAction}
          </TrackedCaps>
        </Pressable>

        {/* Beside the action rather than in the body text, because it is about
            what the button does. */}
        <Text
          allowFontScaling={false}
          testID="copy-records-nothing"
          className="font-inter-tight"
          style={{
            marginTop: 10,
            fontSize: bodyType.preview.size,
            lineHeight: bodyType.preview.lineHeight,
            color: replyWindow.expired.metaInk,
            textAlign: 'center',
          }}
        >
          {CARD_COPY.replyWindow.copyRecordsNothing}
        </Text>
      </View>
    </View>
  );
}
