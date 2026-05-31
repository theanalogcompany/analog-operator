import { Text, View } from 'react-native';

// Cosmetic verification chip rendered on comp/hold/discount heads-up cards.
// The operator reads it aloud or types it when the guest presents the message
// to disambiguate "this is the right person." Recommendations omit (no code
// is generated server-side per `pendingFromEmission`).

type Props = {
  /** Null for recommendation type → renders nothing. */
  code: string | null;
};

export function CodeChip({ code }: Props) {
  if (!code) return null;
  return (
    <View
      accessibilityLabel={`Verification code ${code.split('').join(' ')}`}
      className="self-start rounded-full border-[0.5px] border-hairline bg-paper"
      style={{ paddingHorizontal: 10, paddingVertical: 4 }}
    >
      <Text
        className="font-inter-tight-medium uppercase text-ink"
        style={{
          fontSize: 10.5,
          letterSpacing: 2,
          lineHeight: 13,
        }}
      >
        Code {code}
      </Text>
    </View>
  );
}
