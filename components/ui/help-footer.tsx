import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { showToast } from '@/components/auth/toast';
import { MESSAGES_BLUE } from '@/lib/grounds';
import { openHelpSms } from '@/lib/help';
import { helpPill, typePresets } from '@/lib/theme';

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Defaults to opening Messages to Jaipal, with a toast if that fails. */
  onPress?: () => void;
};

function openHelp(): void {
  void openHelpSms().then((result) => {
    if (!result.ok) showToast("Couldn't open Messages");
  });
}

/**
 * "Chat with Jaipal": the operator's one in-app route to a human.
 *
 * Appears on the sign-in flow, under the empty queue, and in the queue's hint
 * row. Everything else on that row acts on the card in front of the operator;
 * this one leaves the app and opens a text conversation. So it wears iMessage
 * blue, as a pill with a white label, the way a sent message looks. (TAC-388.)
 *
 * WHY THE BLUE IS NOT STOCK. The label is 9.5pt tracked caps, under WCAG's 18pt
 * (14pt bold) large-text threshold, so white on the fill needs 4.5:1. Stock
 * iMessage blue `#007AFF` gives 4.02:1; `MESSAGES_BLUE`, one step darker at the
 * same hue, gives 4.51:1. Blue as the text colour instead fails on every ground
 * (1.38:1 on Honey). The pill's edge against the ground sits below 3:1 on every
 * ground, which is accepted: under WCAG 1.4.11 a control identified by its own
 * readable label needs no contrasting boundary. The figures live in
 * __tests__/lib/ground-contrast.test.ts.
 *
 * There is no "NEED HELP?" preamble. With it the pill does not fit the hint row
 * on a 375pt phone, and the operator knows who Jaipal is.
 */
export function HelpFooter({ style, onPress = openHelp }: Props) {
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Chat with Jaipal via SMS"
        onPress={onPress}
        hitSlop={8}
        // Object form: structural styles are dropped in the `({ pressed }) => ...`
        // form on device. See the CLAUDE.md gotcha before changing it.
        style={{
          backgroundColor: MESSAGES_BLUE,
          borderRadius: 999,
          paddingHorizontal: helpPill.paddingHorizontalPx,
          paddingVertical: helpPill.paddingVerticalPx,
        }}
      >
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          className="font-inter-tight-medium"
          style={{
            fontSize: typePresets.footer.size,
            letterSpacing: typePresets.footer.tracking,
            color: '#FFFFFF',
          }}
        >
          CHAT WITH JAIPAL
        </Text>
      </Pressable>
    </View>
  );
}
