import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { showToast } from '@/components/auth/toast';
import { linkOperator } from '@/lib/auth/operator';
import { supabase } from '@/lib/supabase/client';

type FragmentTokens =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false };

function parseFragmentTokens(url: string): FragmentTokens {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) {
    return { ok: false };
  }
  const fragment = url.slice(hashIdx + 1);
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return { ok: false };
  }
  return { ok: true, accessToken, refreshToken };
}

export default function AuthCallbackScreen() {
  useEffect(() => {
    let active = true;

    async function handleUrl(url: string) {
      const parsed = parseFragmentTokens(url);
      if (!parsed.ok) {
        showToast('Invalid or expired link. Try again.');
        if (active) router.replace('/sign-in');
        return;
      }
      const { error: setError } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (setError) {
        showToast('Invalid or expired link. Try again.');
        if (active) router.replace('/sign-in');
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) {
        await supabase.auth.signOut();
        showToast('Sign-in link missing email. Try again.');
        if (active) router.replace('/sign-in');
        return;
      }
      const linkResult = await linkOperator({ email });
      if (!linkResult.ok) {
        await supabase.auth.signOut();
        showToast(
          linkResult.error === 'not_provisioned'
            ? "Your account isn't set up yet. Contact Analog support."
            : 'Something went wrong linking your account. Try again.',
        );
        if (active) router.replace('/sign-in');
        return;
      }
      if (active) router.replace('/');
    }

    Linking.getInitialURL().then((url) => {
      if (url && active) handleUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <View className="flex-1 bg-sand items-center justify-center px-6">
      <Text
        className="font-fraunces text-inbound text-center"
        style={{ fontSize: 24, lineHeight: 30 }}
      >
        Signing you in…
      </Text>
    </View>
  );
}
