import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { GroundScreen } from '@/components/ground/ground-screen';
import { TopNav } from '@/components/shell/top-nav';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { useNotificationPermission } from '@/hooks/use-notification-permission';
import { useSession } from '@/lib/auth/use-session';
import { openHelpSms } from '@/lib/help';
import { requestPermission } from '@/lib/notifications/permissions';
import { useQueueContext } from '@/lib/queue-context';
import { supabase } from '@/lib/supabase/client';
import { display, layout, typePresets } from '@/lib/theme';
import { venueNameFromSlug } from '@/lib/venue-name';
import { useVenueSlug } from '@/lib/venue';

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
  const queue = useQueueContext();
  const permission = useNotificationPermission();
  const insets = useSafeAreaInsets();

  // Operators sign in by PHONE, so `user.email` is null for almost all of
  // them — the earlier version made the whole meta line conditional on email
  // and it simply never rendered. Phone is the fallback, and there is always
  // one of the two.
  const user = session.status === 'signed-in' ? session.session.user : null;
  const signedInAs = user?.email ?? user?.phone ?? null;

  // Prefer whatever the queue is showing right now, then the remembered slug
  // for when the queue is empty — which in live mode is the normal case.
  const rememberedSlug = useVenueSlug();
  const venueName =
    venueNameFromSlug(queue.drafts[0]?.venueSlug ?? rememberedSlug) ??
    'Your venue';

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
    <GroundScreen name="neutral">
      <TopNav />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 18 }}>
          <Text
        allowFontScaling={false}
            className="font-fraunces"
            style={{
              fontSize: display.screenTitle.size,
              lineHeight: display.screenTitle.lineHeight,
              letterSpacing: display.screenTitle.tracking,
              color: '#FFFFFF',
            }}
          >
            {venueName}
          </Text>
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

          PLACEHOLDER TYPE. This should be the wordmark ASSET, not Fraunces: a
          script lockup set in a different face will hint and letter-space
          differently from the drawn mark, which is exactly the kind of drift a
          wordmark exists to prevent. Drop the file at
          assets/images/wordmark.png and this becomes an <Image>. */}
      <View
        style={{
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: insets.bottom + layout.footerGapPx,
        }}
      >
        <Text
          allowFontScaling={false}
          accessibilityLabel="The Analog Company"
          className="font-fraunces"
          style={{ fontSize: 15, letterSpacing: 0.2, color: 'rgba(255,255,255,0.8)' }}
        >
          the analog company
        </Text>
      </View>
    </GroundScreen>
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
  /** Trailing tracked-caps action, e.g. "Turn on". */
  action?: string;
  chevron?: boolean;
  destructive?: boolean;
  isLast?: boolean;
  onPress?: () => void;
};

function SettingsRow({
  label,
  value,
  action,
  chevron = false,
  destructive = false,
  isLast = false,
  onPress,
}: RowProps) {
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: 'rgba(28,24,20,0.10)',
      }}
    >
      <TrackedCaps
        {...typePresets.settingLabel}
        color={destructive ? '#A85638' : '#1C1814'}
        decorative
        style={{ flex: 1 }}
      >
        {label}
      </TrackedCaps>
      {value ? (
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

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action ? `${label}, ${action}` : label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      {content}
    </Pressable>
  );
}
