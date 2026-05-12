import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

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
    <View className="flex-1 bg-sand px-6 pt-24">
      <Text
        className="font-fraunces text-inbound"
        style={{ fontSize: 40, lineHeight: 46 }}
      >
        Welcome back
      </Text>
      <Text
        className="font-inter-tight text-inbound mt-3"
        style={{ fontSize: 16, lineHeight: 22 }}
      >
        We&apos;ll text you a 6-digit code to sign in.
      </Text>

      <TextInput
        className="font-inter-tight border border-inbound/20 rounded-xl px-4 py-3 mt-8 text-inbound"
        style={{ fontSize: 18 }}
        value={phone}
        onChangeText={setPhone}
        placeholder="(555) 123-4567"
        placeholderTextColor="rgba(58, 53, 48, 0.4)"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
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
          {submitting ? 'Sending…' : 'Send code'}
        </Text>
      </Pressable>

      <Link href="/sign-in/email" asChild>
        <Pressable className="mt-6 items-center">
          <Text className="font-inter-tight text-inbound/70 text-base underline">
            Sign in with email instead
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}
