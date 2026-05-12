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
  const message = err.message ?? '';
  if (/network|fetch failed|timeout/i.test(message)) {
    return { kind: 'network', message: 'Connection issue — try again.' };
  }
  if (/invalid|expired|otp|token/i.test(message)) {
    return {
      kind: 'invalid_code',
      message: "Code didn't match. Try again or resend.",
    };
  }
  return { kind: 'unknown', message: message || 'Something went wrong.' };
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
  if (error || !data.session) {
    return { ok: false, error: mapError(error) };
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
