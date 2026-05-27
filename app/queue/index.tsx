import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { HamburgerMenu } from '@/components/menu/hamburger-menu';
import { EmptyState } from '@/components/queue/empty-state';
import { PermissionDeniedBanner } from '@/components/queue/permission-denied-banner';
import { QueueCardStack } from '@/components/queue/queue-card-stack';
import { QueueHeader } from '@/components/queue/queue-header';
import { UndoToast } from '@/components/queue/undo-toast';
import {
  type UndoRecord,
  clearUndoState,
  setUndoState,
} from '@/hooks/use-undo-state';
import { useSession } from '@/lib/auth/use-session';
import { type PendingDraft, approveDraft, undoAction } from '@/lib/api/queue';
import { setBadgeCount } from '@/lib/notifications/badge';
import {
  consumePendingTap,
  subscribeToTaps,
} from '@/lib/notifications/tap-handler';
import { supabase } from '@/lib/supabase/client';

import { useQueueContext } from './_layout';

// Title-case the email local-part for the greeting. Real first-name field on
// the operator row is a follow-up; deriving from email is a pilot stop-gap.
function firstNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0];
  if (!local) return null;
  // Split on common separators so `jp.silla` → `Jp` (first segment only).
  const first = local.split(/[._-]/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function timeOfDayGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function Greeting({ name }: { name: string | null }) {
  const phrase = timeOfDayGreeting();
  return (
    <Text
      className="font-fraunces text-ink"
      style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.4 }}
    >
      {name ? `${phrase}, ${name}.` : `${phrase}.`}
    </Text>
  );
}

function MetaRow({
  draftCount,
  needsInputCount,
}: {
  draftCount: number;
  needsInputCount: number;
}) {
  return (
    <View className="flex-row items-baseline" style={{ marginTop: 8, gap: 8 }}>
      <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 13 }}>
        {draftCount}
      </Text>
      <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
        drafts
      </Text>
      <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
        ·
      </Text>
      <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 13 }}>
        {needsInputCount}
      </Text>
      <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
        need your input
      </Text>
    </View>
  );
}

const HELP_SMS_URL = 'sms:+17869530853';

async function openHelpSms(): Promise<void> {
  try {
    await Linking.openURL(HELP_SMS_URL);
  } catch {
    showToast("Couldn't open Messages");
  }
}

function Footer() {
  return (
    <View className="items-center" style={{ paddingTop: 8, paddingBottom: 16 }}>
      <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 12 }}>
        Need help?{' '}
        <Text
          accessibilityRole="link"
          accessibilityLabel="Chat with Jaipal via SMS"
          className="font-inter-tight-medium text-clay"
          onPress={() => {
            void openHelpSms();
          }}
        >
          Chat with Jaipal
        </Text>
      </Text>
    </View>
  );
}

export default function QueueScreen() {
  const queue = useQueueContext();
  const router = useRouter();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [surfacedGuestId, setSurfacedGuestId] = useState<string | null>(null);

  const operatorEmail =
    session.status === 'signed-in' ? session.session.user.email ?? null : null;
  const operatorFirstName = firstNameFromEmail(operatorEmail);
  const draftCount = queue.drafts.length;
  const needsInputCount = queue.drafts.filter((d) => !!d.reviewReason).length;

  // Drain any pending notification-tap on mount (cold-launch case) and subscribe
  // for warm-launch taps that land while the queue is mounted. Surfacing reorders
  // the FIFO list so that guest's card lands on top of the stack for this mount;
  // normal FIFO resumes once the surfaced card is dispatched. Per TAC-288
  // settled-decision #4.
  useEffect(() => {
    const pending = consumePendingTap();
    if (pending) setSurfacedGuestId(pending);
    return subscribeToTaps((guestId) => {
      consumePendingTap();
      setSurfacedGuestId(guestId);
    });
  }, []);

  // Surface the pushed guest's card on top of the FIFO stack for this mount.
  // If the surfaced guest is no longer in the queue (sent / skipped from
  // another device, or just dispatched here), fall back to the natural order.
  const displayDrafts = useMemo(() => {
    if (!surfacedGuestId) return queue.drafts;
    const idx = queue.drafts.findIndex((d) => d.guestId === surfacedGuestId);
    if (idx === -1) return queue.drafts;
    return [
      queue.drafts[idx],
      ...queue.drafts.slice(0, idx),
      ...queue.drafts.slice(idx + 1),
    ];
  }, [queue.drafts, surfacedGuestId]);

  // Badge mirrors the visible queue. Sync on every drafts change (covers swipe
  // approve + restore + realtime updates + reload) and on foreground transitions
  // (covers server-driven badge updates that drift from the local count while
  // the app was backgrounded). Queue length is the source of truth — brief
  // divergence under the TAC-37 undo flow is by design.
  useEffect(() => {
    void setBadgeCount(queue.drafts.length);
  }, [queue.drafts.length]);

  // Track latest drafts.length in a ref so the AppState subscription stays
  // mounted across re-renders. Subscribing on every count change would tear
  // down and re-attach the listener for no benefit.
  const draftCountRef = useRef(queue.drafts.length);
  draftCountRef.current = queue.drafts.length;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void setBadgeCount(draftCountRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  const handleApprove = async (draft: PendingDraft): Promise<void> => {
    queue.optimisticallyRemove(draft.messageId);
    if (draft.guestId === surfacedGuestId) setSurfacedGuestId(null);
    void setUndoState({ action: 'approve', draft });
    const result = await approveDraft(draft.messageId);
    if (!result.ok) {
      queue.restore(draft);
      void clearUndoState();
      showToast("Couldn't send — tap to retry");
    }
  };

  const handleEdit = (draft: PendingDraft): void => {
    if (draft.guestId === surfacedGuestId) setSurfacedGuestId(null);
    router.push({ pathname: '/queue/edit', params: { messageId: draft.messageId } });
  };

  const handleUndo = (record: UndoRecord): void => {
    queue.restore(record.draft);
    void undoAction(record.message_id);
  };

  const handleSignOut = (): void => {
    void supabase.auth.signOut();
  };

  return (
    <SafeAreaView className="flex-1 bg-sand">
      <PermissionDeniedBanner />
      <QueueHeader onMenuPress={() => setMenuOpen(true)} />

      {queue.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C66A4A" />
        </View>
      ) : queue.status === 'error' ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-fraunces text-ink" style={{ fontSize: 24, textAlign: 'center' }}>
            We couldn&rsquo;t load the queue.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading the queue"
            onPress={() => void queue.reload()}
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
          <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 4 }}>
            <Greeting name={operatorFirstName} />
            <MetaRow draftCount={draftCount} needsInputCount={needsInputCount} />
          </View>
          {displayDrafts.length === 0 ? (
            <EmptyState />
          ) : (
            <QueueCardStack
              drafts={displayDrafts}
              onApprove={handleApprove}
              onEdit={handleEdit}
            />
          )}
          <Footer />
        </>
      )}

      <UndoToast onUndo={handleUndo} />
      <HamburgerMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
      />
    </SafeAreaView>
  );
}
