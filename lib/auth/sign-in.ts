import type { AuthError, Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

export type AuthErrorKind =
  | 'rate_limited'
  | 'network'
  | 'invalid_code'
  | 'unknown';

export type AuthFailure = {
  kind: AuthErrorKind;
  message: string;
};

export type AuthResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: AuthFailure };

function mapError(err: AuthError | null): AuthFailure {
  if (!err) {
    return { kind: 'unknown', message: 'Something went wrong. Try again.' };
  }
  if (err.status === 429) {
    return {
      kind: 'rate_limited',
      message: 'Too many requests — try again in a moment.',
    };
  }
  if (
    err.status === 0 ||
    /network|fetch failed|timeout/i.test(err.message ?? '')
  ) {
    return { kind: 'network', message: 'Connection issue — try again.' };
  }
  return {
    kind: 'unknown',
    message: err.message || 'Something went wrong.',
  };
}

const INVALID_CODE_MESSAGE = "Code didn't match. Try again or resend.";

function isVerifyClientError(err: AuthError): boolean {
  if (typeof err.status !== 'number') return false;
  if (err.status === 429) return false;
  return err.status >= 400 && err.status < 500;
}

export async function sendPhoneOtp(phoneE164: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
  if (error) {
    return { ok: false, error: mapError(error) };
  }
  return { ok: true, data: undefined };
}

export async function verifyPhoneOtp(
  phoneE164: string,
  token: string,
): Promise<AuthResult<Session>> {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token,
    type: 'sms',
  });
  if (error) {
    if (isVerifyClientError(error)) {
      return {
        ok: false,
        error: { kind: 'invalid_code', message: INVALID_CODE_MESSAGE },
      };
    }
    return { ok: false, error: mapError(error) };
  }
  if (!data.session) {
    return { ok: false, error: mapError(null) };
  }
  return { ok: true, data: data.session };
}

export async function sendMagicLink(
  email: string,
  redirectTo: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    return { ok: false, error: mapError(error) };
  }
  return { ok: true, data: undefined };
}

export async function resendPhoneOtp(phoneE164: string): Promise<AuthResult> {
  return sendPhoneOtp(phoneE164);
}
