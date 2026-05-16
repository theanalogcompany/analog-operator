import { fireEvent, render, screen } from '@testing-library/react-native';

import { QueueHeader } from '@/components/queue/queue-header';

describe('QueueHeader', () => {
  it('renders the wordmark text', () => {
    render(<QueueHeader onMenuPress={() => {}} />);
    expect(screen.getByText('the analog company')).toBeTruthy();
  });

  it('exposes a labelled menu button', () => {
    render(<QueueHeader onMenuPress={() => {}} />);
    expect(screen.getByLabelText('Open menu')).toBeTruthy();
  });

  it('fires onMenuPress when the menu button is pressed', () => {
    const onMenuPress = jest.fn();
    render(<QueueHeader onMenuPress={onMenuPress} />);
    fireEvent.press(screen.getByLabelText('Open menu'));
    expect(onMenuPress).toHaveBeenCalledTimes(1);
  });

  it('does not render the legacy `analog.` wordmark or pending count', () => {
    render(<QueueHeader onMenuPress={() => {}} />);
    expect(screen.queryByText(/^analog\.?$/)).toBeNull();
    expect(screen.queryByText(/PENDING/)).toBeNull();
  });
});
