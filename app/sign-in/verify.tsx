import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/auth/toast';
import { linkOperator } from '@/lib/auth/operator';
import { resendPhoneOtp, verifyPhoneOtp } from '@/lib/auth/sign-in';
import { supabase } from '@/lib/supabase/client';

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function onVerify() {
    if (!phone) return;
    setSubmitting(true);
    setErrorText(null);
    const verifyResult = await verifyPhoneOtp(phone, token);
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
    <View className="flex-1 bg-sand px-6 pt-24">
      <Text
        className="font-fraunces text-inbound"
        style={{ fontSize: 32, lineHeight: 38 }}
      >
        Enter the code
      </Text>
      <Text
        className="font-inter-tight text-inbound/70 mt-3"
        style={{ fontSize: 16, lineHeight: 22 }}
      >
        Sent to {phone}
      </Text>

      <TextInput
        className="font-inter-tight border border-inbound/20 rounded-xl px-4 py-3 mt-8 text-inbound text-center"
        style={{ fontSize: 28, letterSpacing: 8 }}
        value={token}
        onChangeText={setToken}
        placeholder="123456"
        placeholderTextColor="rgba(58, 53, 48, 0.3)"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        editable={!submitting}
      />

      {errorText ? (
        <Text
          className="font-inter-tight text-clay mt-3"
          style={{ fontSize: 14, lineHeight: 18 }}
        >
          {errorText}
        </Text>
      ) : null}

      <Pressable
        onPress={onVerify}
        disabled={submitting || token.length !== 6}
        className="bg-clay rounded-xl px-6 py-4 mt-4 items-center"
        style={({ pressed }) => ({
          opacity: pressed || submitting || token.length !== 6 ? 0.5 : 1,
        })}
      >
        <Text className="font-inter-tight-medium text-sand text-base">
          {submitting ? 'Verifying…' : 'Verify'}
        </Text>
      </Pressable>

      <Pressable onPress={onResend} className="mt-6 items-center">
        <Text className="font-inter-tight text-inbound/70 text-base underline">
          Resend code
        </Text>
      </Pressable>
    </View>
  );
}
