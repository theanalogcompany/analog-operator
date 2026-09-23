import { View } from 'react-native';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type ReplyWindowState, hasWindow } from '@/lib/reply-window';
import { replyWindow, typePresets } from '@/lib/theme';

type Props = {
  state: ReplyWindowState;
};

/**
 * The four-state timer pill (TAC-486, A2).
 *
 * Sits exactly where the elapsed pill sits on a text card, right-aligned in the
 * head row. It REPLACES that pill on an Instagram card; a text card is
 * untouched and keeps "Waiting 14 min".
 *
 * The state escalates in three ways at once, and colour is the last of them:
 * the unit gets finer (18h, then 4h 20m, then 42m), the chip gains a hairline
 * border and then a clay fill, and under an hour the word "Urgent" enters the
 * label itself. So the state survives a screen in sunlight and an operator who
 * cannot use the hue, and the accessibility label is the same string the pill
 * shows rather than a second description that could drift from it.
 *
 * Renders nothing where there is no window: a text guest, or an Instagram guest
 * whose window nobody has measured. An unmeasured window is NOT expired, and a
 * pill reading "Closed" there would tell the operator a reachable guest is out
 * of reach.
 */
export function ReplyWindowPill({ state }: Props) {
  if (!hasWindow(state)) return null;

  const colors = replyWindow.pillColors[state.kind];

  return (
    <View
      testID="reply-window-pill"
      style={{
        alignSelf: 'center',
        backgroundColor: colors.bg,
        borderWidth: replyWindow.pill.borderWidthPx,
        borderColor: colors.border,
        borderRadius: replyWindow.pill.radiusPx,
        paddingVertical: replyWindow.pill.paddingVerticalPx,
        paddingHorizontal: replyWindow.pill.paddingHorizontalPx,
      }}
    >
      {/* `decorative` is deliberately NOT passed: this is the one place the
          window state is stated in words, so it has to be readable. TrackedCaps
          announces the original casing, so VoiceOver says "Urgent · 42m left"
          rather than spelling out the uppercased form. */}
      <TrackedCaps {...typePresets.replyTimer} color={colors.ink}>
        {state.label}
      </TrackedCaps>
    </View>
  );
}
