import { render, screen } from '@testing-library/react-native';

import { RecognitionBadge } from '@/components/queue/recognition-badge';

describe('RecognitionBadge', () => {
  it('renders the Guest label', () => {
    render(<RecognitionBadge band="guest" />);
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  it('renders the Regular label', () => {
    render(<RecognitionBadge band="regular" />);
    expect(screen.getByText('Regular')).toBeTruthy();
  });

  it('renders the Returning label', () => {
    render(<RecognitionBadge band="returning" />);
    expect(screen.getByText('Returning')).toBeTruthy();
  });

  it('renders the Raving Fan label', () => {
    render(<RecognitionBadge band="raving-fan" />);
    expect(screen.getByText('Raving Fan')).toBeTruthy();
  });

  it('attaches a descriptive accessibility label', () => {
    render(<RecognitionBadge band="raving-fan" />);
    expect(screen.getByLabelText('Recognition: Raving Fan')).toBeTruthy();
  });
});
