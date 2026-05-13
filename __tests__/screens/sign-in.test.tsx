import { render, screen } from '@testing-library/react-native';

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

describe('SignInScreen', () => {
  it('renders the welcome heading and phone input', () => {
    render(<SignInScreen />);
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByPlaceholderText('(555) 123-4567')).toBeTruthy();
    expect(screen.getByText('Send code')).toBeTruthy();
  });

  it('shows the email fallback link', () => {
    render(<SignInScreen />);
    expect(screen.getByText('Sign in with email instead')).toBeTruthy();
  });
});
