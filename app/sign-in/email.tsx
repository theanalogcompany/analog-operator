import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/auth/toast';
import { sendMagicLink } from '@/lib/auth/sign-in';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailSignInScreen() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit() {
    if (!EMAIL_PATTERN.test(email)) {
      showToast('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    const result = await sendMagicLink(email, Linking.createURL('auth/callback'));
    setSubmitting(false);
    if (!result.ok) {
      showToast(result.error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View className="flex-1 bg-sand px-6 pt-24">
        <Text
          className="font-fraunces text-inbound"
          style={{ fontSize: 32, lineHeight: 38 }}
        >
          Check your email
        </Text>
        <Text
          className="font-inter-tight text-inbound mt-3"
          style={{ fontSize: 16, lineHeight: 22 }}
        >
          We sent a sign-in link to {email}. Tap it to come back to the app.
        </Text>
        <Pressable
          onPress={() => router.replace('/sign-in')}
          className="mt-8 items-center"
        >
          <Text className="font-inter-tight text-inbound/70 text-base underline">
            Use phone number instead
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-sand px-6 pt-24">
      <Text
        className="font-fraunces text-inbound"
        style={{ fontSize: 32, lineHeight: 38 }}
      >
        Sign in with email
      </Text>
      <Text
        className="font-inter-tight text-inbound/70 mt-3"
        style={{ fontSize: 16, lineHeight: 22 }}
      >
        We&apos;ll send you a one-time link.
      </Text>

      <TextInput
        className="font-inter-tight border border-inbound/20 rounded-xl px-4 py-3 mt-8 text-inbound"
        style={{ fontSize: 18 }}
        value={email}
        onChangeText={setEmail}
        placeholder="you@cafe.com"
        placeholderTextColor="rgba(58, 53, 48, 0.4)"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!submitting}
      />

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        className="bg-clay rounded-xl px-6 py-4 mt-4 items-center"
        style={({ pressed }) => ({
          opacity: pressed || submitting ? 0.7 : 1,
        })}
      >
        <Text className="font-inter-tight-medium text-sand text-base">
          {submitting ? 'Sending…' : 'Send link'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace('/sign-in')}
        className="mt-6 items-center"
      >
        <Text className="font-inter-tight text-inbound/70 text-base underline">
          Use phone number instead
        </Text>
      </Pressable>
    </View>
  );
}
