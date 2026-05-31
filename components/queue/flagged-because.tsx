import { Text, View } from 'react-native';

import { type CommitmentType } from '@/lib/api/commitments';

// Renders the "Flagged because:" block on heads-up cards. Same visual chassis
// as `FlaggedBanner` (clay left-border, sand bg) but the copy is templated
// client-side from the commitment payload (per ticket: "Flag copy source:
// templated client-side from the TAC-297 payload — no TAC-297 change").
//
// Functional/terse for v1 — not agent-voice prose (accepted in ticket).
// Example: "Hold for Maya — oat latte on the house, expected this morning."

type Props = {
  type: CommitmentType;
  description: string;
  expectedArrival: string | null;
  guestName: string;
  /** Override `Date.now()` so tests can pin the time-of-day bucket. */
  now?: Date;
};

const TYPE_LABEL: Record<CommitmentType, string> = {
  comp: 'Comp',
  hold: 'Hold',
  discount: 'Discount',
  recommendation: 'Ready',
};

function arrivalPhrase(iso: string | null, now: Date): string {
  if (!iso) return '';
  const arrival = new Date(iso);
  const ms = arrival.getTime();
  if (Number.isNaN(ms)) return '';
  const diffMs = ms - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  // "in N minutes" up to 60; otherwise bucket into morning/afternoon/evening
  // by the venue/operator local time (device tz for v1 — see CLAUDE.md
  // thread-cluster gotcha for the device-tz convention).
  if (diffMin >= 0 && diffMin <= 60) {
    if (diffMin <= 5) return ' arriving now';
    return ` arriving in ${diffMin} min`;
  }
  if (diffMin < 0) return ''; // already arrived; just show the rest
  const hour = arrival.getHours();
  if (hour < 12) return ' this morning';
  if (hour < 17) return ' this afternoon';
  return ' this evening';
}

function nameOrFallback(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : 'a guest';
}

export function flaggedBecauseCopy({
  type,
  description,
  expectedArrival,
  guestName,
  now = new Date(),
}: Props): string {
  const typeLabel = TYPE_LABEL[type];
  const name = nameOrFallback(guestName);
  const when = arrivalPhrase(expectedArrival, now);
  return `${typeLabel} for ${name}${when} — ${description}.`;
}

export function FlaggedBecause(props: Props) {
  const copy = flaggedBecauseCopy(props);
  return (
    <View
      accessibilityLabel={`Flagged because: ${copy}`}
      className="mx-4 mb-[14px] rounded-[4px] border-l-2 border-clay bg-sand"
      style={{ paddingHorizontal: 14, paddingVertical: 12 }}
    >
      <Text
        className="font-inter-tight text-ink"
        style={{ fontSize: 13, lineHeight: 20 }}
      >
        <Text className="font-inter-tight-medium text-clay-deep">
          Flagged because:{' '}
        </Text>
        {copy}
      </Text>
    </View>
  );
}
