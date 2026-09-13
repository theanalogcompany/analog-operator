import { type ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroundScreen } from '@/components/ground/ground-screen';
import { HelpFooter } from '@/components/ui/help-footer';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { body as bodyType, display, layout, typePresets } from '@/lib/theme';

const LOGO = require('../../assets/images/logo.png');

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

/**
 * The shared frame for every screen in the sign-in flow: the mark, an
 * editorial title, a line of explanation, whatever the screen is asking for,
 * and the help footer pinned to the bottom.
 *
 * All three auth screens sit on the `auth` ground. That name is currently an
 * alias for clay — see lib/grounds.ts — so the colour exercise can give the
 * front door its own identity without any screen changing.
 */
export function AuthFrame({ title, subtitle, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <GroundScreen name="auth">
      <View style={{ flex: 1, paddingHorizontal: 26 }}>
        <View style={{ alignItems: 'center', paddingTop: 56, paddingBottom: 40 }}>
          <Image
            source={LOGO}
            accessibilityLabel="Analog"
            resizeMode="contain"
            // The mark ships dark with an alpha channel; tintColor is the RN
            // equivalent of the design's `brightness(0) invert(1)`.
            tintColor="#FFFFFF"
            style={{ width: 44, height: 44 }}
          />
        </View>

        <Text
        allowFontScaling={false}
          className="font-fraunces"
          style={{
            fontSize: display.authTitle.size,
            lineHeight: display.authTitle.lineHeight,
            letterSpacing: display.authTitle.tracking,
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        <Text
        allowFontScaling={false}
          className="font-inter-tight"
          style={{
            marginTop: 14,
            fontSize: bodyType.authSubtitle.size,
            lineHeight: bodyType.authSubtitle.lineHeight,
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          {subtitle}
        </Text>

        {children}

        <View style={{ flex: 1 }} />
        <HelpFooter style={{ marginBottom: insets.bottom + layout.footerGapPx }} />
      </View>
    </GroundScreen>
  );
}

type CtaProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

/**
 * The primary action: ink fill, tracked caps, full width.
 *
 * LAYOUT LIVES IN A PLAIN OBJECT STYLE, NOT THE `({ pressed }) => ...` FORM.
 * On device the function form was silently dropped and this rendered as bare
 * left-aligned text with no pill at all — while object-form styles on the same
 * component (see TopNav) rendered correctly. It did not reproduce in Jest, so
 * rather than keep chasing it, anything structural goes in the object and the
 * function form is reserved for press feedback, where failing means a missing
 * dim rather than a missing button.
 */
export function AuthCta({ label, onPress, disabled = false }: CtaProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        marginTop: 14,
        height: 52,
        borderRadius: 16,
        backgroundColor: '#1C1814',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <TrackedCaps {...typePresets.cta} color="#FFFFFF" decorative>
        {label}
      </TrackedCaps>
    </Pressable>
  );
}

type LinkProps = {
  label: string;
  onPress: () => void;
};

/**
 * The secondary route out of a screen — centred, underlined, quieter than the
 * CTA. Object-form style for the same reason as AuthCta above.
 */
export function AuthLink({ label, onPress }: LinkProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        marginTop: 26,
        alignSelf: 'center',
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.6)',
      }}
    >
      <TrackedCaps {...typePresets.link} color="#FFFFFF" decorative>
        {label}
      </TrackedCaps>
    </Pressable>
  );
}

/**
 * The white input the sign-in and email screens share. Exported as a style
 * rather than a wrapper component, because each screen needs its own keyboard
 * type, autofill hints and content type — a wrapper would just be a pass-through
 * with a longer prop list.
 */
export const authFieldStyle = {
  marginTop: 36,
  height: 52,
  borderRadius: 16,
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 18,
  fontSize: 16,
  color: '#1C1814',
} as const;

export const AUTH_PLACEHOLDER_COLOR = 'rgba(28,24,20,0.35)';
