import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AuthCta, AuthFrame, AuthLink } from '@/components/auth/auth-frame';
import { showToast } from '@/components/auth/toast';
import { linkOperator } from '@/lib/auth/operator';
import { resendPhoneOtp, verifyPhoneOtp } from '@/lib/auth/sign-in';
import { supabase } from '@/lib/supabase/client';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  const complete = code.length === CODE_LENGTH;

  async function onVerify() {
    if (!phone || !complete) return;
    setSubmitting(true);
    setErrorText(null);
    const verifyResult = await verifyPhoneOtp(phone, code);
    if (!verifyResult.ok) {
      setSubmitting(false);
      setErrorText(verifyResult.error.message);
      return;
    }
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
          onChangeText={(next) =>
            setCode(next.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH))
          }
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
        onPress={() => void onVerify()}
        disabled={submitting || !complete}
      />
      <AuthLink label="Resend code" onPress={() => void onResend()} />
    </AuthFrame>
  );
}
