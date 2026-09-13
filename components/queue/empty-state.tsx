import { Text, View } from 'react-native';

import { display } from '@/lib/theme';

type Props = {
  variant?: 'queue' | 'conversations';
};

const COPY = {
  queue: {
    headline: 'You’re all caught up.',
    body: 'Nothing pending review. Guests are being handled. Take a breath.',
  },
  conversations: {
    headline: 'Nothing here right now.',
    body: "No conversations match that filter. Loosen it and they'll come back.",
  },
} as const;

/** Renders on a ground, so everything here is white. */
export function EmptyState({ variant = 'queue' }: Props) {
  const copy = COPY[variant];
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ gap: 16, paddingHorizontal: 40, paddingBottom: 70 }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#E5B19C',
          marginBottom: 6,
        }}
      />
      <Text
        allowFontScaling={false}
        className="font-fraunces"
        style={{
          fontSize: display.emptyTitle.size,
          lineHeight: display.emptyTitle.lineHeight,
          color: '#FFFFFF',
          textAlign: 'center',
        }}
      >
        {copy.headline}
      </Text>
      <Text
        allowFontScaling={false}
        className="font-inter-tight"
        style={{
          fontSize: 13,
          lineHeight: 20,
          color: 'rgba(255,255,255,0.92)',
          textAlign: 'center',
          maxWidth: 250,
        }}
      >
        {copy.body}
      </Text>
    </View>
  );
}
