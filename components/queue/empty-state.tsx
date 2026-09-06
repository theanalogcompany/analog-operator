import { Text, View } from 'react-native';

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

export function EmptyState({ variant = 'queue' }: Props) {
  const copy = COPY[variant];
  return (
    <View className="flex-1 items-center px-8" style={{ paddingTop: 80, gap: 14 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#C66A4A',
          marginBottom: 8,
        }}
      />
      <Text
        className="font-fraunces text-ink"
        style={{ fontSize: 32, lineHeight: 36, textAlign: 'center' }}
      >
        {copy.headline}
      </Text>
      <Text
        className="font-inter-tight text-ink-faint"
        style={{ fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 240 }}
      >
        {copy.body}
      </Text>
    </View>
  );
}
