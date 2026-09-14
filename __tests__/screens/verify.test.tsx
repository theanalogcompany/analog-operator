import { fireEvent, render, screen } from '@testing-library/react-native';
import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import VerifyScreen from '@/app/sign-in/verify';
import { resendPhoneOtp } from '@/lib/auth/sign-in';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      verifyOtp: jest.fn(),
      signOut: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

jest.mock('@/lib/auth/sign-in', () => ({
  resendPhoneOtp: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
  verifyPhoneOtp: jest.fn(),
}));

jest.mock('@/lib/auth/operator', () => ({
  linkOperator: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ phone: '+15551234567' }),
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

describe('VerifyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the verify heading and shows the masked phone', () => {
    render(withSafeArea(<VerifyScreen />));
    expect(screen.getByText('Enter the code')).toBeTruthy();
    expect(screen.getByText(/Sent to \+15551234567/)).toBeTruthy();
    // Six cells replace the single field. The real input sits invisibly over
    // them so SMS autofill still works, and it is reached by label.
    expect(screen.getByLabelText('6-digit code')).toBeTruthy();
  });

  it('renders the Resend button and dispatches resendPhoneOtp on tap', () => {
    render(withSafeArea(<VerifyScreen />));
    fireEvent.press(screen.getByLabelText('Resend code'));
    expect(resendPhoneOtp).toHaveBeenCalledWith('+15551234567');
  });
});
