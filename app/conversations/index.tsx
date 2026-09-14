// app/conversations/index.tsx
// The "Texts" tab. The route and the component keep the `conversations` name —
// the redesign renames only what the operator reads, and churning the route
// would take the realtime channel, the context and four test files with it.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationRow } from '@/components/conversations/conversation-row';
import {
  TypeFilterMenu,
  type TypeFilterOption,
} from '@/components/conversations/type-filter-menu';
import { GroundScreen } from '@/components/ground/ground-screen';
import { EmptyState } from '@/components/queue/empty-state';
import { TopNav } from '@/components/shell/top-nav';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type RecognitionState } from '@/lib/api/queue';
import { useConversationsContext } from '@/lib/conversations-context';
import { isConversationActive } from '@/lib/conversations-format';
import {
  conversations as conversationsTheme,
  display,
  recognition,
  typePresets,
} from '@/lib/theme';

/** Where the filter panel hangs from, measured to sit under the pill row. */
const FILTER_MENU_TOP = 242;

export default function ConversationsScreen() {
  const conversationsResult = useConversationsContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeOnly, setActiveOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilterOption>('all');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  const activeCount = useMemo(
    () =>
      conversationsResult.conversations.filter((c) =>
        isConversationActive(c.lastMessageAt, conversationsTheme.activeWindowMins),
      ).length,
    [conversationsResult.conversations],
  );
  const totalCount = conversationsResult.conversations.length;

  const counts: Record<TypeFilterOption, number> = useMemo(() => {
    const base: Record<TypeFilterOption, number> = {
      all: conversationsResult.conversations.length,
      new: 0,
      returning: 0,
      regular: 0,
      raving_fan: 0,
    };
    for (const c of conversationsResult.conversations) {
      if (c.recognitionState) base[c.recognitionState] += 1;
    }
    return base;
  }, [conversationsResult.conversations]);

  const rows = useMemo(() => {
    return conversationsResult.conversations
      .filter((c) => (typeFilter === 'all' ? true : c.recognitionState === typeFilter))
      .filter((c) =>
        activeOnly
          ? isConversationActive(c.lastMessageAt, conversationsTheme.activeWindowMins)
          : true,
      );
  }, [conversationsResult.conversations, typeFilter, activeOnly]);

  const typeLabel =
    typeFilter === 'all'
      ? 'All guests'
      : recognition.stateLabels[typeFilter as RecognitionState];

  return (
    <GroundScreen name="resting">
      <TopNav />

      {conversationsResult.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : conversationsResult.status === 'error' ? (
        <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: 32 }}>
          <Text
        allowFontScaling={false}
            className="font-fraunces"
            style={{
              fontSize: display.emptyTitle.size,
              lineHeight: display.emptyTitle.lineHeight,
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            We couldn&rsquo;t load your texts.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading conversations"
            onPress={() => void conversationsResult.reload()}
            // Object form: structural styles are dropped in the
            // `({ pressed }) => ...` form on device.
            // Cause unknown; see the CLAUDE.md gotcha before changing it back.
            style={{
              marginTop: 24,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.4)',
              borderRadius: 999,
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
          >
            <TrackedCaps {...typePresets.link} color="#FFFFFF" decorative>
              Try again
            </TrackedCaps>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14 }}>
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
              Everything happening.
            </Text>
            <TrackedCaps
              {...typePresets.screenMeta}
              color="rgba(255,255,255,0.92)"
              style={{ marginTop: 12 }}
            >
              {`${activeCount} active now · ${totalCount} open`}
            </TrackedCaps>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingHorizontal: 22,
              paddingBottom: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Active"
              accessibilityState={{ selected: activeOnly }}
              onPress={() => setActiveOnly((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                borderRadius: 999,
                paddingHorizontal: 13,
                paddingVertical: 7,
                backgroundColor: activeOnly ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
                borderWidth: 1,
                borderColor: activeOnly ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 5,
                  backgroundColor: activeOnly ? '#A85638' : '#E5B19C',
                }}
              />
              <TrackedCaps
                {...typePresets.filterPill}
                color={activeOnly ? '#1C1814' : '#FFFFFF'}
                decorative
              >
                Active
              </TrackedCaps>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${typeLabel} filter`}
              onPress={() => setTypeMenuOpen((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderRadius: 999,
                paddingHorizontal: 13,
                paddingVertical: 7,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              <TrackedCaps {...typePresets.filterPill} color="#FFFFFF" decorative>
                {typeLabel}
              </TrackedCaps>
              <Text allowFontScaling={false} style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)' }}>▼</Text>
            </Pressable>
          </View>

          <TypeFilterMenu
            visible={typeMenuOpen}
            selected={typeFilter}
            counts={counts}
            top={FILTER_MENU_TOP}
            onSelect={(option) => {
              setTypeFilter(option);
              setTypeMenuOpen(false);
            }}
            onDismiss={() => setTypeMenuOpen(false)}
          />

          {rows.length === 0 ? (
            <EmptyState variant="conversations" />
          ) : (
            // No grouping and no section headers — the filters do that job.
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 14,
                paddingBottom: insets.bottom + 24,
              }}
            >
              {rows.map((row, i) => (
                <ConversationRow
                  key={row.guestId}
                  conversation={row}
                  banded={i % 2 === 0}
                  onPress={() =>
                    router.push({
                      pathname: '/conversations/[guestId]',
                      params: { guestId: row.guestId },
                    })
                  }
                />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </GroundScreen>
  );
}
