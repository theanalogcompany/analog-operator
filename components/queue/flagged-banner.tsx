import { Text, View } from 'react-native';

// The pre-extract banner rendered at slightly different metrics in the queue
// card vs the edit screen. Preserve both visuals via a `variant` prop so the
// refactor stays behavior-preserving on both surfaces.
type Variant = 'card' | 'edit';

type Props = {
  label: string | null | undefined;
  detail?: string | null;
  variant?: Variant;
};

const VARIANTS: Record<
  Variant,
  {
    container: string;
    text: { fontSize: number; lineHeight: number };
  }
> = {
  card: {
    container: 'mx-4 mb-[14px]',
    text: { fontSize: 13, lineHeight: 20 },
  },
  edit: {
    container: 'mx-[18px] mb-1',
    text: { fontSize: 12.5, lineHeight: 19 },
  },
};

export function FlaggedBanner({ label, detail, variant = 'card' }: Props) {
  const hasDetail = !!detail && detail.trim().length > 0;
  if (!label && !hasDetail) return null;
  const styles = VARIANTS[variant];
  return (
    <View
      className={`${styles.container} rounded-[4px] border-l-2 border-clay bg-sand`}
      style={{ paddingHorizontal: 14, paddingVertical: 12 }}
    >
      {label ? (
        <Text className="font-inter-tight text-ink" style={styles.text}>
          <Text className="font-inter-tight-medium text-clay-deep">
            Flagged because:{' '}
          </Text>
          {label}
        </Text>
      ) : null}
      {hasDetail ? (
        <Text
          accessibilityLabel="Agent reasoning"
          className="font-fraunces text-ink"
          style={{ marginTop: 6, fontSize: 13, lineHeight: 18 }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
