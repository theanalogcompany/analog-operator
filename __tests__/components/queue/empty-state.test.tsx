import { render, screen } from '@testing-library/react-native';

import { EmptyState } from '@/components/queue/empty-state';

describe('EmptyState', () => {
  it('renders the all-caught-up headline', () => {
    render(<EmptyState />);
    expect(screen.getByText('You’re all caught up.')).toBeTruthy();
  });

  it('renders an intentional supporting line', () => {
    render(<EmptyState />);
    expect(
      screen.getByText('Nothing pending review. Guests are being handled. Take a breath.'),
    ).toBeTruthy();
  });
});
