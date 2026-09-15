import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import type React from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import VerifyScreen from '@/app/sign-in/verify';
import { showToast } from '@/components/auth/toast';
import { linkOperator, type LinkOperatorResult } from '@/lib/auth/operator';
import { resendPhoneOtp } from '@/lib/auth/sign-in';
import { supabase } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      verifyOtp: jest.fn(),
      signOut: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

// `verifyPhoneOtp` is the real one. Whether a failure counts as a wrong code
// (clear the field) or a failure to reach the server (keep it) is decided in
// lib/auth/sign-in.ts, so these tests stub Supabase underneath it rather than
// the function that makes that call. Only Resend is replaced.
jest.mock('@/lib/auth/sign-in', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/lib/auth/sign-in'),
  resendPhoneOtp: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

jest.mock('@/lib/auth/operator', () => ({
  linkOperator: jest.fn(),
}));

jest.mock('@/components/auth/toast', () => ({
  showToast: jest.fn(),
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

const PHONE = '+15551234567';
const WRONG_CODE_MESSAGE = "Code didn't match. Try again or resend.";

const verifyOtp = supabase.auth.verifyOtp as jest.Mock;
const signOut = supabase.auth.signOut as jest.Mock;
const linkOperatorMock = linkOperator as jest.MockedFunction<typeof linkOperator>;

const OPERATOR = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  phone_number: PHONE,
  email: 'op@cafe.com',
  auth_user_id_phone: null,
  auth_user_id_email: null,
};

function verified() {
  return {
    data: { user: {}, session: { access_token: 'access', refresh_token: 'refresh' } },
    error: null,
  };
}

function rejectedWith(status: number, message: string) {
  return { data: { user: null, session: null }, error: { status, message } };
}

/** A verify call that never settles, so a test can look at the screen mid-flight. */
function hangVerify() {
  verifyOtp.mockReturnValue(new Promise(() => {}));
}

function codeInput() {
  return screen.getByLabelText('6-digit code');
}

/** RN's Jest TextInput mock carries `focus` as a jest.fn on the instance. */
function inputFocus(): jest.Mock {
  return (screen.UNSAFE_getByType(TextInput).instance as { focus: jest.Mock }).focus;
}

describe('VerifyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps queued `mockResolvedValueOnce` values; a leftover one
    // would answer the next test's first call.
    verifyOtp.mockReset();
    linkOperatorMock.mockReset();
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

  describe('auto-submit', () => {
    it('does not submit before the sixth digit', () => {
      hangVerify();
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '12345');
      expect(verifyOtp).not.toHaveBeenCalled();
    });

    it('submits on the sixth typed digit without a tap', () => {
      hangVerify();
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '12345');
      fireEvent.changeText(codeInput(), '123456');
      expect(verifyOtp).toHaveBeenCalledTimes(1);
      // What is sent is unchanged by TAC-399; only when it is sent moved.
      expect(verifyOtp).toHaveBeenCalledWith({
        phone: PHONE,
        token: '123456',
        type: 'sms',
      });
    });

    it('submits when autofill delivers all six digits in one event', () => {
      hangVerify();
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '123456');
      expect(verifyOtp).toHaveBeenCalledTimes(1);
    });
  });

  describe('double-submit guard', () => {
    it('sends one verify call when the code arrives twice before a render', () => {
      hangVerify();
      render(withSafeArea(<VerifyScreen />));
      const input = codeInput();
      // One act() scope, so React does not render between these two events and
      // the second runs against the same props and closure as the first: an
      // autofill event firing twice. A guard kept in React state lets both
      // through. Only a guard set synchronously stops the second.
      act(() => {
        fireEvent.changeText(input, '123456');
        fireEvent.changeText(input, '123456');
      });
      expect(verifyOtp).toHaveBeenCalledTimes(1);
    });

    it('sends one verify call for two taps on Verify before a render', async () => {
      verifyOtp.mockResolvedValueOnce(rejectedWith(0, 'Network request failed'));
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '123456');
      await screen.findByText('Connection issue — try again.');
      expect(verifyOtp).toHaveBeenCalledTimes(1);

      hangVerify();
      const verify = screen.getByLabelText('Verify');
      act(() => {
        fireEvent.press(verify);
        fireEvent.press(verify);
      });
      expect(verifyOtp).toHaveBeenCalledTimes(2);
    });

    it('holds through linkOperator, so the consumed code cannot go out again', async () => {
      verifyOtp.mockResolvedValue(verified());
      let finishLink: (result: LinkOperatorResult) => void = () => {};
      linkOperatorMock.mockReturnValue(
        new Promise<LinkOperatorResult>((resolve) => {
          finishLink = resolve;
        }),
      );
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '123456');
      await waitFor(() => expect(linkOperatorMock).toHaveBeenCalledTimes(1));

      // The input is not editable while this runs, so fireEvent would skip it.
      // Calling the handler directly tests the guard itself, not the disabled
      // input in front of it.
      act(() => {
        codeInput().props.onChangeText('123456');
      });
      expect(verifyOtp).toHaveBeenCalledTimes(1);

      await act(async () => {
        finishLink({ ok: true, operator: OPERATOR });
      });
      expect(router.replace).toHaveBeenCalledWith('/');
      expect(verifyOtp).toHaveBeenCalledTimes(1);
    });
  });

  describe('outcomes', () => {
    it('links the operator and goes to the queue on a correct code', async () => {
      verifyOtp.mockResolvedValue(verified());
      linkOperatorMock.mockResolvedValue({ ok: true, operator: OPERATOR });
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '123456');
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
      expect(linkOperatorMock).toHaveBeenCalledWith({ phone: PHONE });
      expect(signOut).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it.each([
      ['not_provisioned', "Your account isn't set up yet. Contact Analog support."],
      ['rpc_failed', 'Something went wrong linking your account. Try again.'],
    ] as const)('signs back out when linking fails with %s', async (error, toast) => {
      verifyOtp.mockResolvedValue(verified());
      linkOperatorMock.mockResolvedValue({ ok: false, error });
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '123456');
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(toast);
      expect(router.replace).not.toHaveBeenCalledWith('/');
    });

    it('clears and refocuses the field on a wrong code, then takes the next one', async () => {
      // GoTrue answers a wrong or expired code with 403.
      verifyOtp.mockResolvedValueOnce(rejectedWith(403, 'Token has expired or is invalid'));
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '123456');
      await screen.findByText(WRONG_CODE_MESSAGE);
      expect(codeInput().props.value).toBe('');
      expect(inputFocus()).toHaveBeenCalledTimes(1);
      expect(linkOperatorMock).not.toHaveBeenCalled();

      hangVerify();
      fireEvent.changeText(codeInput(), '654321');
      expect(verifyOtp).toHaveBeenCalledTimes(2);
      expect(verifyOtp).toHaveBeenLastCalledWith({
        phone: PHONE,
        token: '654321',
        type: 'sms',
      });
    });

    it.each([
      ['a network error', 0, 'Network request failed', 'Connection issue — try again.'],
      ['a rate limit', 429, 'Too many requests', 'Too many requests — try again in a moment.'],
      ['a server error', 500, 'Internal server error', 'Internal server error'],
    ])('keeps the typed code after %s', async (_case, status, serverMessage, shown) => {
      verifyOtp.mockResolvedValueOnce(rejectedWith(status, serverMessage));
      render(withSafeArea(<VerifyScreen />));
      fireEvent.changeText(codeInput(), '123456');
      await screen.findByText(shown);
      expect(codeInput().props.value).toBe('123456');
      expect(screen.queryByText(WRONG_CODE_MESSAGE)).toBeNull();
      expect(inputFocus()).not.toHaveBeenCalled();
      expect(linkOperatorMock).not.toHaveBeenCalled();
      // Verify is live again for the retry.
      expect(screen.getByLabelText('Verify').props.accessibilityState).toEqual({
        disabled: false,
      });
    });

    it('keeps the code, logs, and releases the guard when verify throws', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const thrown = new Error('unexpected');
        verifyOtp.mockRejectedValueOnce(thrown);
        render(withSafeArea(<VerifyScreen />));
        fireEvent.changeText(codeInput(), '123456');
        await screen.findByText('Something went wrong. Try again.');
        expect(codeInput().props.value).toBe('123456');
        // The only trace of why on device, so it must not be swallowed.
        expect(warn).toHaveBeenCalledWith('[auth/verify] verifyPhoneOtp threw', thrown);

        hangVerify();
        fireEvent.press(screen.getByLabelText('Verify'));
        expect(verifyOtp).toHaveBeenCalledTimes(2);
      } finally {
        warn.mockRestore();
      }
    });
  });
});
