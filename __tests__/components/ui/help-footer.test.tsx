import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { StyleSheet } from 'react-native';

import { HelpFooter } from '@/components/ui/help-footer';
import { MESSAGES_BLUE } from '@/lib/grounds';

/**
 * "Chat with Jaipal" is the one control that leaves the app, so it reads as a
 * text conversation: an iMessage-blue pill with a white label, and no
 * preamble. (TAC-388.) The contrast figures that chose the blue live in
 * __tests__/lib/ground-contrast.test.ts.
 */

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/components/auth/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => {
  (Linking.openURL as jest.Mock).mockClear();
});

describe('HelpFooter', () => {
  it('reads CHAT WITH JAIPAL, with no "NEED HELP?" preamble', () => {
    render(<HelpFooter />);
    expect(screen.getByText('CHAT WITH JAIPAL')).toBeTruthy();
    expect(screen.queryByText(/NEED HELP/)).toBeNull();
  });

  it('is announced as a link out of the app', () => {
    render(<HelpFooter />);
    expect(screen.getByLabelText('Chat with Jaipal via SMS').props.accessibilityRole).toBe('link');
  });

  it('wears iMessage blue as a pill behind a white label', () => {
    render(<HelpFooter />);
    const pill = StyleSheet.flatten(screen.getByLabelText('Chat with Jaipal via SMS').props.style);
    expect(pill).toMatchObject({ backgroundColor: MESSAGES_BLUE, borderRadius: 999 });
    const label = StyleSheet.flatten(screen.getByText('CHAT WITH JAIPAL').props.style);
    expect(label).toMatchObject({ color: '#FFFFFF' });
  });

  it('opens Messages to Jaipal by default', () => {
    render(<HelpFooter />);
    fireEvent.press(screen.getByLabelText('Chat with Jaipal via SMS'));
    expect(Linking.openURL).toHaveBeenCalledWith('sms:+17869530853');
  });

  it('calls the handler it is given instead, when there is one', () => {
    const onPress = jest.fn();
    render(<HelpFooter onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Chat with Jaipal via SMS'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
