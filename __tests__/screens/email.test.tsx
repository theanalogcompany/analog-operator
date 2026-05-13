import { render, screen } from '@testing-library/react-native';

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

describe('EmailSignInScreen', () => {
  it('renders the email heading, input, and CTA', () => {
    render(<EmailSignInScreen />);
    expect(screen.getByText('Sign in with email')).toBeTruthy();
    expect(screen.getByPlaceholderText('you@cafe.com')).toBeTruthy();
    expect(screen.getByText('Send link')).toBeTruthy();
  });

  it('shows the phone-fallback link', () => {
    render(<EmailSignInScreen />);
    expect(screen.getByText('Use phone number instead')).toBeTruthy();
  });
});
