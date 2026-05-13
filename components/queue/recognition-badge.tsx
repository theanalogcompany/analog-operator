import { Text, View } from 'react-native';

import { type RecognitionBand } from '@/lib/api/queue';
import { recognition } from '@/lib/theme';

type Palette = {
  bg: string;
  text: string;
  dot: string;
};

const PALETTES: Record<RecognitionBand, Palette> = {
  guest: { bg: '#EDE4D2', text: '#4A4339', dot: '#857A6A' },
  returning: { bg: '#EDE4D2', text: '#4A4339', dot: '#4A4339' },
  regular: { bg: '#E5B19C', text: '#6B3220', dot: '#A85638' },
  'raving-fan': { bg: '#C66A4A', text: '#FFFFFF', dot: '#FFFFFF' },
};

type Props = {
  band: RecognitionBand;
};

export function RecognitionBadge({ band }: Props) {
  const palette = PALETTES[band];
  const label = recognition.bandLabels[band];
  return (
    <View
      accessibilityLabel={`Recognition: ${label}`}
      className="flex-row items-center self-start rounded-full px-2 py-[3px]"
      style={{ backgroundColor: palette.bg, gap: 5 }}
    >
      <View
        style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: palette.dot }}
      />
      <Text
        className="font-inter-tight-medium uppercase"
        style={{
          color: palette.text,
          fontSize: 9.5,
          letterSpacing: 1.33,
          fontWeight: '600',
          lineHeight: 11,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
