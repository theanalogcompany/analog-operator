import { render, screen } from '@testing-library/react-native';

import { RecognitionBadge } from '@/components/queue/recognition-badge';

// The redesign renders recognition as tracked caps, so the visible string is
// uppercased. The casing is a visual transform applied in JS (RN can't be
// trusted with `text-transform` on Android), which is why the label the badge
// announces to a screen reader stays in its original casing — asserted below.
describe('RecognitionBadge', () => {
  it.each([
    ['new', 'NEW', 'New'],
    ['regular', 'REGULAR', 'Regular'],
    ['returning', 'RETURNING', 'Returning'],
    ['raving_fan', 'RAVING FAN', 'Raving Fan'],
  ] as const)('renders %s as tracked caps', (state, visible, spoken) => {
    render(<RecognitionBadge state={state} />);
    expect(screen.getByText(visible)).toBeTruthy();
    expect(screen.getByLabelText(`Recognition: ${spoken}`)).toBeTruthy();
  });

  it('announces the un-uppercased label, so VoiceOver does not spell it out', () => {
    render(<RecognitionBadge state="raving_fan" />);
    expect(screen.getByLabelText('Recognition: Raving Fan')).toBeTruthy();
    expect(screen.queryByLabelText('Recognition: RAVING FAN')).toBeNull();
  });

  it('renders nothing when state is null', () => {
    const { toJSON } = render(<RecognitionBadge state={null} />);
    expect(toJSON()).toBeNull();
  });

  it('renders on both surfaces without changing what it says', () => {
    const { rerender } = render(
      <RecognitionBadge state="returning" variant="card" />,
    );
    expect(screen.getByLabelText('Recognition: Returning')).toBeTruthy();
    rerender(<RecognitionBadge state="returning" variant="ground" />);
    expect(screen.getByLabelText('Recognition: Returning')).toBeTruthy();
  });
});
