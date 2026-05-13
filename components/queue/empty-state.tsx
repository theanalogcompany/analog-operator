import { Text, View } from 'react-native';

export function EmptyState() {
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
        You&rsquo;re all caught up.
      </Text>
      <Text
        className="font-inter-tight text-ink-faint"
        style={{ fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 240 }}
      >
        Nothing pending review. Guests are being handled. Take a breath.
      </Text>
    </View>
  );
}
