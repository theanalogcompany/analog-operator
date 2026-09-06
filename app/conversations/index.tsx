// app/conversations/index.tsx
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HamburgerMenu } from '@/components/menu/hamburger-menu';
import { ConversationRow } from '@/components/conversations/conversation-row';
import { TypeFilterMenu, type TypeFilterOption } from '@/components/conversations/type-filter-menu';
import { EmptyState } from '@/components/queue/empty-state';
import { QueueTabsHeader } from '@/components/shell/queue-tabs-header';
import { useConversations } from '@/hooks/use-conversations';
import { isConversationActive } from '@/lib/conversations-format';
import { type RecognitionState } from '@/lib/api/queue';
import { conversations as conversationsTheme, recognition } from '@/lib/theme';
import { supabase } from '@/lib/supabase/client';

export default function ConversationsScreen() {
  const conversationsResult = useConversations();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
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
    typeFilter === 'all' ? 'All guests' : recognition.stateLabels[typeFilter as RecognitionState];

  const handleSignOut = (): void => {
    void supabase.auth.signOut();
  };

  return (
    <SafeAreaView className="flex-1 bg-sand" style={{ position: 'relative' }}>
      <QueueTabsHeader onMenuPress={() => setMenuOpen(true)} />

      {conversationsResult.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C66A4A" />
        </View>
      ) : conversationsResult.status === 'error' ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-fraunces text-ink" style={{ fontSize: 24, textAlign: 'center' }}>
            We couldn&rsquo;t load conversations.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading conversations"
            onPress={() => void conversationsResult.reload()}
            className="mt-6 rounded-lg border-[0.5px] border-hairline px-5 py-3"
          >
            <Text
              className="font-inter-tight-medium uppercase text-ink"
              style={{ fontSize: 10, letterSpacing: 1.8 }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 10 }}>
            <Text
              className="font-fraunces text-ink"
              style={{ fontSize: 27, lineHeight: 32, letterSpacing: -0.4 }}
            >
              Everything happening.
            </Text>
            <View className="flex-row items-baseline" style={{ marginTop: 7, gap: 7 }}>
              <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 13 }}>
                {activeCount}
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
                active now
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
                ·
              </Text>
              <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 13 }}>
                {totalCount}
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
                open
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingBottom: 14 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Active"
              onPress={() => setActiveOnly((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: activeOnly ? '#1C1814' : '#FFFFFF',
                borderWidth: 0.5,
                borderColor: activeOnly ? '#1C1814' : 'rgba(28, 24, 20, 0.12)',
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 5,
                  backgroundColor: activeOnly ? '#E5B19C' : '#C66A4A',
                }}
              />
              <Text
                className="font-inter-tight-medium"
                style={{ fontSize: 11.5, color: activeOnly ? '#F7F1E3' : '#4A4339' }}
              >
                Active
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${typeLabel} filter`}
              onPress={() => setTypeMenuOpen((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: typeFilter === 'all' ? '#FFFFFF' : '#EDE4D2',
                borderWidth: 0.5,
                borderColor: 'rgba(28, 24, 20, 0.12)',
              }}
            >
              <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 11.5 }}>
                {typeLabel}
              </Text>
              <Text style={{ fontSize: 9, opacity: 0.6 }}>▾</Text>
            </Pressable>
          </View>

          <TypeFilterMenu
            visible={typeMenuOpen}
            selected={typeFilter}
            counts={counts}
            onSelect={(option) => {
              setTypeFilter(option);
              setTypeMenuOpen(false);
            }}
            onDismiss={() => setTypeMenuOpen(false)}
          />

          {rows.length === 0 ? (
            <EmptyState variant="conversations" />
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 20 }}>
              <View
                className="rounded-[16px] border-[0.5px] border-hairline bg-white"
                style={{ overflow: 'hidden' }}
              >
                {rows.map((row, i) => (
                  <ConversationRow
                    key={row.guestId}
                    conversation={row}
                    isFirst={i === 0}
                    onPress={() =>
                      router.push({
                        pathname: '/conversations/[guestId]',
                        params: { guestId: row.guestId },
                      })
                    }
                  />
                ))}
              </View>
            </View>
          )}
        </>
      )}

      <HamburgerMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
      />
    </SafeAreaView>
  );
}
