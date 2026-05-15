import { fireEvent, render, screen } from '@testing-library/react-native';

import { HamburgerMenu } from '@/components/menu/hamburger-menu';

describe('HamburgerMenu', () => {
  it('renders the sign-out item when visible', () => {
    render(
      <HamburgerMenu visible onClose={() => {}} onSignOut={() => {}} />,
    );
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
  });

  it('renders nothing when hidden', () => {
    render(
      <HamburgerMenu visible={false} onClose={() => {}} onSignOut={() => {}} />,
    );
    expect(screen.queryByLabelText('Sign out')).toBeNull();
  });

  it('fires onClose when the backdrop is pressed', () => {
    const onClose = jest.fn();
    render(<HamburgerMenu visible onClose={onClose} onSignOut={() => {}} />);
    fireEvent.press(screen.getByLabelText('Dismiss menu'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onSignOut (and closes) when Sign out is pressed', () => {
    const onClose = jest.fn();
    const onSignOut = jest.fn();
    render(
      <HamburgerMenu visible onClose={onClose} onSignOut={onSignOut} />,
    );
    fireEvent.press(screen.getByLabelText('Sign out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
