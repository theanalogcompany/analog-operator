import { Text } from 'react-native';

type Props = {
  reasoning: string | null | undefined;
  paddingTop: number;
  paddingBottom: number;
};

// The Fraunces variant loaded for `font-fraunces` is already
// `Fraunces_400Regular_Italic` — see tailwind.config.js. No `italic` className
// needed; it's a no-op on this font.
export function AgentReasoning({ reasoning, paddingTop, paddingBottom }: Props) {
  if (!reasoning || reasoning.trim().length === 0) return null;
  return (
    <Text
      accessibilityLabel="Agent reasoning"
      className="font-fraunces text-ink-faint"
      style={{
        paddingHorizontal: 18,
        paddingTop,
        paddingBottom,
        fontSize: 13,
        lineHeight: 18,
      }}
    >
      {reasoning}
    </Text>
  );
}
