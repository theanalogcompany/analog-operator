import { Text, type StyleProp, type TextStyle, View } from 'react-native';

import { showToast } from '@/components/auth/toast';
import { openHelpSms } from '@/lib/help';
import { typePresets } from '@/lib/theme';

type Props = {
  style?: StyleProp<TextStyle>;
};

/**
 * "Need help? Chat with Jaipal" — the operator's one in-app route to a human.
 *
 * Appears on the sign-in flow, under the empty queue, and inside the queue's
 * hint row. Rendered as a single Text with a nested Text rather than two
 * siblings so it wraps and centers as one phrase; the name takes full white
 * while the question stays at 0.85.
 */
export function HelpFooter({ style }: Props) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        allowFontScaling={false}
        accessibilityRole="link"
        accessibilityLabel="Chat with Jaipal via SMS"
        onPress={() => {
          void openHelpSms().then((result) => {
            if (!result.ok) showToast("Couldn't open Messages");
          });
        }}
        className="font-inter-tight-medium"
        style={[
          {
            fontSize: typePresets.footer.size,
            letterSpacing: typePresets.footer.tracking,
            color: 'rgba(255,255,255,0.85)',
          },
          style,
        ]}
      >
        {'NEED HELP? '}
        <Text allowFontScaling={false} style={{ color: '#FFFFFF' }}>CHAT WITH JAIPAL</Text>
      </Text>
    </View>
  );
}
