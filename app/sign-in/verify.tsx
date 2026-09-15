import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AuthCta, AuthFrame, AuthLink } from '@/components/auth/auth-frame';
import { showToast } from '@/components/auth/toast';
import { linkOperator } from '@/lib/auth/operator';
import { resendPhoneOtp, verifyPhoneOtp } from '@/lib/auth/sign-in';
import { supabase } from '@/lib/supabase/client';

const CODE_LENGTH = 6;

/**
 * `verifyPhoneOtp` returns its failures as values, but supabase-js rethrows
 * anything that isn't an AuthError. Uncaught, that would escape the handler
 * with the submit guard still held, and Verify would do nothing for the rest of
 * the screen's life. It is treated like a failure to reach the server, so the
 * code the operator typed is kept.
 */
async function verifyCode(
  phone: string,
  code: string,
): ReturnType<typeof verifyPhoneOtp> {
  try {
    return await verifyPhoneOtp(phone, code);
  } catch (e) {
    console.warn('[auth/verify] verifyPhoneOtp threw', e);
    return {
      ok: false,
      error: { kind: 'unknown', message: 'Something went wrong. Try again.' },
    };
  }
}

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Bumped when a wrong code clears the field. The refocus waits for the render
  // that makes the input editable again, because focusing it while
  // `editable={false}` is not reliable on iOS.
  const [refocusRequest, setRefocusRequest] = useState(0);
  const inputRef = useRef<TextInput | null>(null);
  // The double-submit guard, and it has to be a ref. An autofill event firing
  // twice, or a double tap on Verify, can call `submit` twice before React
  // renders, and both calls would read `submitting` as false. Two calls for one
  // code means the loser comes back "Code didn't match" while the winner signs in.
  const inFlightRef = useRef(false);

  const complete = code.length === CODE_LENGTH;

  useEffect(() => {
    if (refocusRequest > 0) inputRef.current?.focus();
  }, [refocusRequest]);

  async function submit(candidate: string) {
    if (!phone || candidate.length !== CODE_LENGTH) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setErrorText(null);

    const verifyResult = await verifyCode(phone, candidate);
    if (!verifyResult.ok) {
      // The one branch where the operator stays here to try again, so the only
      // one that releases the guard.
      inFlightRef.current = false;
      setSubmitting(false);
      setErrorText(verifyResult.error.message);
      // Only a code the server rejected is cleared. After a network error or a
      // rate limit the code may be fine, and retyping it costs the operator.
      if (verifyResult.error.kind === 'invalid_code') {
        setCode('');
        setRefocusRequest((n) => n + 1);
      }
      return;
    }
    // The code is consumed now, so the guard stays held through linkOperator
    // and on both ways out. Neither strands the screen: success leaves through
    // `Stack.Protected` in app/_layout.tsx once the new session renders, and a
    // link failure through `router.replace('/sign-in')`. A future path that
    // keeps the operator here after a successful verify must release it.
    const linkResult = await linkOperator({ phone });
    setSubmitting(false);
    if (!linkResult.ok) {
      await supabase.auth.signOut();
      showToast(
        linkResult.error === 'not_provisioned'
          ? "Your account isn't set up yet. Contact Analog support."
          : 'Something went wrong linking your account. Try again.',
      );
      router.replace('/sign-in');
      return;
    }
    router.replace('/');
  }

  function onChangeCode(next: string) {
    const digits = next.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    // The sixth digit is the whole code, so there is nothing to confirm. SMS
    // autofill delivers all six in one event and takes the same path. This hangs
    // off the input event, not an effect on `code`, so a code kept after a
    // network error doesn't resubmit by itself.
    if (digits.length === CODE_LENGTH) void submit(digits);
  }

  async function onResend() {
    if (!phone) return;
    const result = await resendPhoneOtp(phone);
    if (!result.ok) {
      showToast(result.error.message);
      return;
    }
    showToast('Code resent.');
  }

  return (
    <AuthFrame title="Enter the code" subtitle={`Sent to ${phone ?? ''}`}>
      {/* Six cells, one input. The cells are a presentation of `code`; the
          real TextInput sits invisibly on top so the OS keyboard, autofill and
          one-time-code suggestion all behave normally. Six separate inputs
          would break SMS autofill and force manual focus juggling. */}
      <View style={{ marginTop: 36 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter the 6-digit code"
          onPress={() => inputRef.current?.focus()}
          style={{ flexDirection: 'row', gap: 8 }}
        >
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const digit = code[i] ?? '';
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: digit ? '#FFFFFF' : 'rgba(255,255,255,0.22)',
                }}
              >
                <Text
        allowFontScaling={false}
                  className="font-inter-tight-medium"
                  style={{ fontSize: 22, color: '#1C1814' }}
                >
                  {digit}
                </Text>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={inputRef}
          accessibilityLabel="6-digit code"
          value={code}
          onChangeText={onChangeCode}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={CODE_LENGTH}
          editable={!submitting}
          autoFocus
          // Invisible but focusable and on top of the cells. `opacity: 0` keeps
          // it in the layout and hit-testable, which `display: none` would not.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            opacity: 0,
          }}
        />
      </View>

      {errorText ? (
        <Text
        allowFontScaling={false}
          className="font-inter-tight"
          style={{
            marginTop: 12,
            fontSize: 12.5,
            lineHeight: 18,
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          {errorText}
        </Text>
      ) : null}

      <AuthCta
        label={submitting ? 'Verifying…' : complete ? 'Verify' : 'Fill the code'}
        onPress={() => void submit(code)}
        disabled={submitting || !complete}
      />
      <AuthLink label="Resend code" onPress={() => void onResend()} />
    </AuthFrame>
  );
}
