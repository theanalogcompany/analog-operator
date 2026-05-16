import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { HamburgerMenu } from '@/components/menu/hamburger-menu';
import { EmptyState } from '@/components/queue/empty-state';
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

  const operatorEmail =
    session.status === 'signed-in' ? session.session.user.email ?? null : null;
  const operatorFirstName = firstNameFromEmail(operatorEmail);
  const draftCount = queue.drafts.length;
  const needsInputCount = queue.drafts.filter((d) => !!d.reviewReason).length;

  const handleApprove = async (draft: PendingDraft): Promise<void> => {
    queue.optimisticallyRemove(draft.messageId);
    void setUndoState({ action: 'approve', draft });
    const result = await approveDraft(draft.messageId);
    if (!result.ok) {
      queue.restore(draft);
      void clearUndoState();
      showToast("Couldn't send — tap to retry");
    }
  };

  const handleEdit = (draft: PendingDraft): void => {
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
          {queue.drafts.length === 0 ? (
            <EmptyState />
          ) : (
            <QueueCardStack
              drafts={queue.drafts}
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
