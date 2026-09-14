import { render, screen } from '@testing-library/react-native';
import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import EmailSignInScreen from '@/app/sign-in/email';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { signInWithOtp: jest.fn() },
  },
}));

jest.mock('@/lib/auth/sign-in', () => ({
  sendMagicLink: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `analog-operator://${path}`,
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

// AuthFrame reads safe-area insets to place the help footer above the home
// indicator, so these screens need a provider with real metrics.
const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
function withSafeArea(ui: React.ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
}

describe('EmailSignInScreen', () => {
  it('renders the email heading, input, and CTA', () => {
    render(withSafeArea(<EmailSignInScreen />));
    expect(screen.getByText('Sign in with email')).toBeTruthy();
    expect(screen.getByPlaceholderText('you@cafe.com')).toBeTruthy();
    expect(screen.getByLabelText('Send link')).toBeTruthy();
  });

  it('shows the phone-fallback link', () => {
    render(withSafeArea(<EmailSignInScreen />));
    expect(screen.getByLabelText('Use phone number instead')).toBeTruthy();
  });
});
