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

  it('renders the conversations-tab copy when variant is "conversations"', () => {
    render(<EmptyState variant="conversations" />);
    expect(screen.getByText('Nothing here right now.')).toBeTruthy();
    expect(
      screen.getByText("No conversations match that filter. Loosen it and they'll come back."),
    ).toBeTruthy();
  });

  it('still renders the default queue copy when no variant is passed', () => {
    render(<EmptyState />);
    expect(screen.getByText('You’re all caught up.')).toBeTruthy();
  });
});
