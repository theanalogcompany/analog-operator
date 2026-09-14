import * as Linking from 'expo-linking';
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
import { sendMagicLink } from '@/lib/auth/sign-in';

export default function EmailSignInScreen() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit() {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      showToast('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    const result = await sendMagicLink(trimmed, Linking.createURL('auth/callback'));
    setSubmitting(false);
    if (!result.ok) {
      showToast(result.error.message);
      return;
    }
    setSent(true);
    showToast('Check your email for the sign-in link.');
  }

  return (
    <AuthFrame
      title="Sign in with email"
      subtitle={
        sent
          ? `We sent a sign-in link to ${email.trim()}. Open it on this phone.`
          : "We'll email you a link that signs you in."
      }
    >
      <TextInput
        accessibilityLabel="Email address"
        className="font-inter-tight"
        style={authFieldStyle}
        value={email}
        onChangeText={setEmail}
        placeholder="you@cafe.com"
        placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!submitting}
      />
      <AuthCta
        label={submitting ? 'Sending…' : sent ? 'Resend link' : 'Send link'}
        onPress={() => void onSubmit()}
        disabled={submitting}
      />
      <AuthLink
        label="Use phone number instead"
        onPress={() => router.back()}
      />
    </AuthFrame>
  );
}
