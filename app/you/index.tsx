import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { type ReactNode, useRef } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { GroundScreen } from '@/components/ground/ground-screen';
import { TopNav } from '@/components/shell/top-nav';
import { VenuePicker } from '@/components/shell/venue-picker';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { useNotificationPermission } from '@/hooks/use-notification-permission';
import { useNow } from '@/hooks/use-now';
import { useVenueInstagram } from '@/hooks/use-venue-instagram';
import { useSession } from '@/lib/auth/use-session';
import { openHelpSms } from '@/lib/help';
import {
  INSTAGRAM_COPY,
  type InstagramRowView,
  connectionView,
  openInstagramConnect,
  rowAction,
  rowDetail,
  rowValue,
} from '@/lib/instagram-connection';
import { requestPermission } from '@/lib/notifications/permissions';
import { supabase } from '@/lib/supabase/client';
import { body as bodyType, instagramIdentity, layout, typePresets } from '@/lib/theme';
import { useVenueSelection } from '@/lib/venue-context';

/**
 * The full wordmark, 480x92 (aspect 5.217), drawn in the brand cream
 * (rgb(249,244,230)) on alpha. Rendered UNTINTED — unlike the "a" mark on the
 * sign-in screen, which ships dark and is tinted white, this one already
 * carries its own colour and tinting it would flatten the cream to plain white.
 * Source is ~3x the rendered size, so it stays crisp at @3x.
 */
const WORDMARK = require('../../assets/images/analog_full_cream_480.png');
const WORDMARK_WIDTH = 156;
const WORDMARK_HEIGHT = Math.round(WORDMARK_WIDTH * (92 / 480));

// `0 8px 22px rgba(20,17,14,0.14)` — the design's panel shadow. Cross-platform
// `boxShadow` for the same reason the queue card uses it: Android's elevation
// fallback would flatten it into a hard edge.
const cardShadow = {
  boxShadow: '0px 8px 22px rgba(20,17,14,0.14)',
} as const;

/**
 * The account screen, and the home of sign-out.
 *
 * The hamburger menu it replaces hid the app's only destructive action behind
 * an unlabelled icon. Here it is a discrete row on its own card — reachable,
 * clearly the last thing on the screen, and impossible to hit while reaching
 * for something else.
 */
export default function YouScreen() {
  const session = useSession();
  const permission = useNotificationPermission();
  const insets = useSafeAreaInsets();

  // Operators sign in by PHONE, so `user.email` is null for almost all of
  // them — the earlier version made the whole meta line conditional on email
  // and it simply never rendered. Phone is the fallback, and there is always
  // one of the two.
  const user = session.status === 'signed-in' ? session.session.user : null;
  const signedInAs = user?.email ?? user?.phone ?? null;

  const pushValue =
    permission === 'granted' ? 'On' : permission === 'loading' ? '—' : 'Off';

  const handlePushAction = (): void => {
    if (permission === 'granted') return;
    if (permission === 'undetermined') {
      void requestPermission();
      return;
    }
    // Once denied, iOS will not re-prompt — Settings is the only route back.
    void Linking.openSettings().catch(() => {
      showToast("Couldn't open Settings");
    });
  };

  return (
    <GroundScreen name="resting">
      <TopNav />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 18 }}>
          {/* The title IS the venue selector for a multi-venue operator.
              The name now comes from `venues.name` rather than being
              un-slugified from a queue draft, which is what kept printing
              "Le Mils Coffee" for a venue called "Le Mil's Coffee". */}
          <VenuePicker />
          {signedInAs ? (
            <TrackedCaps
              {...typePresets.screenMeta}
              color="rgba(255,255,255,0.92)"
              style={{ marginTop: 10 }}
            >
              {`Signed in as ${signedInAs}`}
            </TrackedCaps>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 18, gap: 9 }}>
          <InstagramCard />

          <SettingsCard>
            <SettingsRow
              label="Push notifications"
              value={pushValue}
              action={permission === 'granted' ? undefined : 'Turn on'}
              onPress={permission === 'granted' ? undefined : handlePushAction}
            />
            <SettingsRow
              label="Chat with Jaipal"
              chevron
              isLast
              onPress={() => {
                void openHelpSms().then((result) => {
                  if (!result.ok) showToast("Couldn't open Messages");
                });
              }}
            />
          </SettingsCard>

          <SettingsCard>
            <SettingsRow
              label="Sign out"
              destructive
              isLast
              onPress={() => {
                void supabase.auth.signOut();
              }}
            />
          </SettingsCard>
        </View>

      </ScrollView>

      {/* A real footer: outside the ScrollView, so it sits against the bottom
          of the screen whatever the content length does, rather than trailing
          the last card. The wordmark closes the screen rather than opening it
          — the "a" mark at the top was competing with the venue name for the
          same job.

          The drawn mark, not type set in Fraunces: a script lockup rendered in
          a different face hints and letter-spaces differently from the real
          thing, which is the drift a wordmark exists to prevent. */}
      <View
        style={{
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: insets.bottom + layout.footerGapPx,
        }}
      >
        <Image
          source={WORDMARK}
          accessibilityLabel="The Analog Company"
          resizeMode="contain"
          style={{ width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT, opacity: 0.85 }}
        />
      </View>
    </GroundScreen>
  );
}

/**
 * The selected venue's Instagram connection (TAC-517). Rendered only once a
 * venue is selected, because the not-connected wording names it.
 *
 * Connect and Reconnect go through a confirm step BEFORE the browser opens:
 * whichever Instagram account the phone is logged into is the one that gets
 * connected, the same trap as the expired card's deep link (TAC-486).
 */
function InstagramCard() {
  const { selectedVenue } = useVenueSelection();
  const venueId = selectedVenue?.id ?? null;
  const { state, refetch } = useVenueInstagram(venueId);
  const nowMs = useNow();
  // One connect at a time. The alert covers the screen, but the gap between
  // Continue and the browser opening is a network round trip.
  const connecting = useRef(false);

  if (!selectedVenue) return null;

  const view: InstagramRowView =
    state.kind === 'loading'
      ? { kind: 'loading' }
      : state.kind === 'error'
        ? { kind: 'unknown' }
        : connectionView(state.instagram, nowMs);

  const value = rowValue(view);
  const action = rowAction(view);
  const detail = rowDetail(view, selectedVenue.name);

  const startConnect = (): void => {
    if (connecting.current) return;
    connecting.current = true;
    void openInstagramConnect(selectedVenue.id).then((result) => {
      connecting.current = false;
      if (result.ok) return;
      showToast(
        result.error.kind === 'OPEN_FAILED'
          ? INSTAGRAM_COPY.openFailedToast
          : INSTAGRAM_COPY.connectFailedToast,
      );
    });
  };

  const handlePress = (): void => {
    if (view.kind === 'unknown') {
      refetch();
      return;
    }
    Alert.alert(INSTAGRAM_COPY.confirmTitle, INSTAGRAM_COPY.confirmMessage, [
      { text: INSTAGRAM_COPY.confirmCancel, style: 'cancel' },
      { text: INSTAGRAM_COPY.confirmContinue, onPress: startConnect },
    ]);
  };

  const handleIsValue = view.kind === 'connected' || view.kind === 'expiring';

  return (
    <SettingsCard>
      <SettingsRow
        label={INSTAGRAM_COPY.label}
        value={value ?? undefined}
        valueAsIs={handleIsValue}
        action={action ?? undefined}
        detail={detail ?? undefined}
        accessibilityLabel={[INSTAGRAM_COPY.label, value, action, detail]
          .filter((part): part is string => !!part)
          .join(', ')}
        isLast
        onPress={action ? handlePress : undefined}
      />
    </SettingsCard>
  );
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          overflow: 'hidden',
        },
        cardShadow,
      ]}
    >
      {children}
    </View>
  );
}

type RowProps = {
  label: string;
  value?: string;
  /**
   * Render the value in its own case rather than tracked caps. For a handle:
   * nobody can look up `@LEMILSCOFFEE` (TAC-486's identity rule).
   */
  valueAsIs?: boolean;
  /** Trailing tracked-caps action, e.g. "Turn on". */
  action?: string;
  chevron?: boolean;
  destructive?: boolean;
  isLast?: boolean;
  /** A sentence under the row, for a state that needs explaining. */
  detail?: string;
  /** Overrides the default label, which is the label plus the action. */
  accessibilityLabel?: string;
  onPress?: () => void;
};

function SettingsRow({
  label,
  value,
  valueAsIs = false,
  action,
  chevron = false,
  destructive = false,
  isLast = false,
  detail,
  accessibilityLabel,
  onPress,
}: RowProps) {
  const line = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <TrackedCaps
        {...typePresets.settingLabel}
        color={destructive ? '#A85638' : '#1C1814'}
        decorative
        style={{ flex: 1 }}
      >
        {label}
      </TrackedCaps>
      {value && valueAsIs ? (
        <Text
          allowFontScaling={false}
          accessible={false}
          numberOfLines={1}
          className="font-inter-tight"
          style={{
            flexShrink: 1,
            fontSize: instagramIdentity.handle.sizePx,
            letterSpacing: instagramIdentity.handle.trackingPx,
            color: '#6F6658',
          }}
        >
          {value}
        </Text>
      ) : value ? (
        <TrackedCaps {...typePresets.settingValue} color="#6F6658" decorative>
          {value}
        </TrackedCaps>
      ) : null}
      {action ? (
        <TrackedCaps {...typePresets.settingValue} color="#A85638" decorative>
          {action}
        </TrackedCaps>
      ) : null}
      {chevron ? (
        <Feather name="chevron-right" size={12} color="#6F6658" />
      ) : null}
    </View>
  );

  const content = (
    <View
      accessible={!onPress && accessibilityLabel ? true : undefined}
      accessibilityLabel={!onPress ? accessibilityLabel : undefined}
      style={{
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: 'rgba(28,24,20,0.10)',
      }}
    >
      {line}
      {detail ? (
        <Text
          allowFontScaling={false}
          accessible={false}
          className="font-inter-tight"
          style={{
            marginTop: 8,
            fontSize: bodyType.preview.size,
            lineHeight: bodyType.preview.lineHeight,
            color: '#6F6658',
          }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (action ? `${label}, ${action}` : label)}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      {content}
    </Pressable>
  );
}
