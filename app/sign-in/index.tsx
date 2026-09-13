import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';

import {
  AUTH_PLACEHOLDER_COLOR,
  AuthCta,
  AuthFrame,
  AuthLink,
  authFieldStyle,
} from '@/components/auth/auth-frame';
import { showToast } from '@/components/auth/toast';
import { sendPhoneOtp } from '@/lib/auth/sign-in';
import { normalizeUsPhone } from '@/lib/phone/normalize';

export default function SignInScreen() {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    const normalized = normalizeUsPhone(phone);
    if (!normalized.ok) {
      showToast('Enter a valid US phone number.');
      return;
    }
    setSubmitting(true);
    const result = await sendPhoneOtp(normalized.e164);
    setSubmitting(false);
    if (!result.ok) {
      showToast(result.error.message);
      return;
    }
    router.push({
      pathname: '/sign-in/verify',
      params: { phone: normalized.e164 },
    });
  }

  return (
    <AuthFrame
      title="Welcome back"
      subtitle="We'll text you a 6-digit code to sign in."
    >
      <TextInput
        accessibilityLabel="Phone number"
        className="font-inter-tight"
        style={authFieldStyle}
        value={phone}
        onChangeText={setPhone}
        placeholder="(555) 123-4567"
        placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        editable={!submitting}
      />
      <AuthCta
        label={submitting ? 'Sending…' : 'Send code'}
        onPress={() => void onSubmit()}
        disabled={submitting}
      />
      <AuthLink
        label="Sign in with email instead"
        onPress={() => router.push('/sign-in/email')}
      />
    </AuthFrame>
  );
}
