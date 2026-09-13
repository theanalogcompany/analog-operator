import { render, screen } from '@testing-library/react-native';
import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignInScreen from '@/app/sign-in/index';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { signInWithOtp: jest.fn() },
  },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Link: ({ children }: { children: React.ReactNode }) => children,
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

describe('SignInScreen', () => {
  it('renders the welcome heading and phone input', () => {
    render(withSafeArea(<SignInScreen />));
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByPlaceholderText('(555) 123-4567')).toBeTruthy();
    // The CTA renders as tracked caps; its accessibility label keeps the
    // original casing, which is what a screen reader announces.
    expect(screen.getByLabelText('Send code')).toBeTruthy();
  });

  it('shows the email fallback link', () => {
    render(withSafeArea(<SignInScreen />));
    expect(screen.getByLabelText('Sign in with email instead')).toBeTruthy();
  });
});
