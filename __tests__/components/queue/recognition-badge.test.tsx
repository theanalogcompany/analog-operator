import { render, screen } from '@testing-library/react-native';

import { RecognitionBadge } from '@/components/queue/recognition-badge';

describe('RecognitionBadge', () => {
  it('renders the New label', () => {
    render(<RecognitionBadge state="new" />);
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('renders the Regular label', () => {
    render(<RecognitionBadge state="regular" />);
    expect(screen.getByText('Regular')).toBeTruthy();
  });

  it('renders the Returning label', () => {
    render(<RecognitionBadge state="returning" />);
    expect(screen.getByText('Returning')).toBeTruthy();
  });

  it('renders the Raving Fan label', () => {
    render(<RecognitionBadge state="raving_fan" />);
    expect(screen.getByText('Raving Fan')).toBeTruthy();
  });

  it('attaches a descriptive accessibility label', () => {
    render(<RecognitionBadge state="raving_fan" />);
    expect(screen.getByLabelText('Recognition: Raving Fan')).toBeTruthy();
  });

  it('renders nothing when state is null', () => {
    const { toJSON } = render(<RecognitionBadge state={null} />);
    expect(toJSON()).toBeNull();
  });
});
