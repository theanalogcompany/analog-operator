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
import {
  type HeadsUpCommitment,
  acknowledgeCommitment,
  declineDraft,
} from '@/lib/api/commitments';
import { type PendingDraft, approveDraft, undoAction } from '@/lib/api/queue';
import { setBadgeCount } from '@/lib/notifications/badge';
import {
  type PendingTap,
  consumePendingTap,
  subscribeToTaps,
} from '@/lib/notifications/tap-handler';
import { type QueueCard, interleaveCards } from '@/lib/queue/cards';
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
  cardCount,
  needsInputCount,
}: {
  cardCount: number;
  needsInputCount: number;
}) {
  return (
    <View className="flex-row items-baseline" style={{ marginTop: 8, gap: 8 }}>
      <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 13 }}>
        {cardCount}
      </Text>
      <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 13 }}>
        in queue
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

// Tap-driven surfacing: when a push tap arrives, the matching card floats to
// the top of the stack for this mount. `commitmentId` takes precedence over
// `guestId` when both are present — commitment pushes carry both fields and
// the operator is being routed to the specific heads-up card. (TAC-298.)
function surfaceCards(
  baseCards: QueueCard[],
  pending: PendingTap | null,
): QueueCard[] {
  if (!pending) return baseCards;
  // Prefer exact commitment match.
  if (pending.commitmentId) {
    const idx = baseCards.findIndex(
      (c) =>
        c.type === 'heads_up' && c.commitment.id === pending.commitmentId,
    );
    if (idx !== -1) {
      return [
        baseCards[idx],
        ...baseCards.slice(0, idx),
        ...baseCards.slice(idx + 1),
      ];
    }
  }
  // Fall back to guest match (legacy draft-push behavior).
  const idx = baseCards.findIndex((c) => {
    if (c.type === 'draft_review') return c.draft.guestId === pending.guestId;
    return false; // commitments don't expose guestId in HeadsUpCommitment payload
  });
  if (idx === -1) return baseCards;
  return [
    baseCards[idx],
    ...baseCards.slice(0, idx),
    ...baseCards.slice(idx + 1),
  ];
}

export default function QueueScreen() {
  const queue = useQueueContext();
  const router = useRouter();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingTap, setPendingTap] = useState<PendingTap | null>(null);

  const operatorEmail =
    session.status === 'signed-in' ? session.session.user.email ?? null : null;
  const operatorFirstName = firstNameFromEmail(operatorEmail);

  const baseCards = useMemo(
    () => interleaveCards(queue.drafts, queue.commitments),
    [queue.drafts, queue.commitments],
  );
  const cards = useMemo(
    () => surfaceCards(baseCards, pendingTap),
    [baseCards, pendingTap],
  );

  const cardCount = cards.length;
  // "Needs your input" counts drafts with a reviewReason. Commitments
  // don't carry that signal (the whole point is that no action is needed
  // unless the operator chooses to decline) — so they're excluded from
  // this count by design.
  const needsInputCount = queue.drafts.filter((d) => !!d.reviewReason).length;

  // Drain any pending notification-tap on mount (cold-launch case) and subscribe
  // for warm-launch taps that land while the queue is mounted. Per TAC-288
  // settled-decision #4, surfacing reorders the FIFO list so the pushed card
  // lands on top of the stack for this mount; FIFO resumes once dispatched.
  // TAC-298 extends the pending-tap shape with optional `commitmentId` —
  // commitment pushes preferentially surface the matching commitment card.
  useEffect(() => {
    const pending = consumePendingTap();
    if (pending) setPendingTap(pending);
    return subscribeToTaps((tap) => {
      consumePendingTap();
      setPendingTap(tap);
    });
  }, []);

  // Badge mirrors the visible queue. Sync on every card-count change (covers
  // swipe approve/acknowledge/decline + restore + realtime updates + reload)
  // and on foreground transitions (covers server-driven badge updates that
  // drift from the local count while the app was backgrounded).
  useEffect(() => {
    void setBadgeCount(cardCount);
  }, [cardCount]);

  const cardCountRef = useRef(cardCount);
  cardCountRef.current = cardCount;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void setBadgeCount(cardCountRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  const handleApprove = async (draft: PendingDraft): Promise<void> => {
    queue.optimisticallyRemoveDraft(draft.messageId);
    if (
      pendingTap &&
      !pendingTap.commitmentId &&
      draft.guestId === pendingTap.guestId
    ) {
      setPendingTap(null);
    }
    void setUndoState({ action: 'approve', draft });
    const result = await approveDraft(draft.messageId);
    if (!result.ok) {
      queue.restoreDraft(draft);
      void clearUndoState();
      showToast("Couldn't send — tap to retry");
    }
  };

  const handleEdit = (draft: PendingDraft): void => {
    if (
      pendingTap &&
      !pendingTap.commitmentId &&
      draft.guestId === pendingTap.guestId
    ) {
      setPendingTap(null);
    }
    router.push({ pathname: '/queue/edit', params: { messageId: draft.messageId } });
  };

  // Swipe-right on a heads-up commitment card. Calls the acknowledge
  // endpoint (server transitions `pending_ack → acknowledged`). Per the
  // CRITICAL no-send guard in the ticket Notes: this MUST NEVER touch
  // `approveDraft` / `editAndSend` — the queue-card-stack handler split
  // makes the wrong wiring impossible to compile. No undo (one-shot, no
  // server reverse endpoint; acknowledge means "I saw it").
  const handleAcknowledge = async (
    commitment: HeadsUpCommitment,
  ): Promise<void> => {
    queue.optimisticallyRemoveCommitment(commitment.id);
    if (pendingTap?.commitmentId === commitment.id) setPendingTap(null);
    const result = await acknowledgeCommitment(commitment.id);
    if (!result.ok) {
      queue.restoreCommitment(commitment);
      showToast("Couldn't acknowledge — tap to retry");
    }
  };

  // Swipe-left on a heads-up commitment card. Calls the draft-decline
  // endpoint (TAC-299) which: (a) generates an apology decline draft and
  // persists it as `messages.review_state='pending'` (NOT sent), and (b)
  // transitions the commitment to `cancelled` server-side. On success we
  // fire a queue refetch in the background (non-silent so its `loading`
  // status is observable) and navigate to the edit screen immediately —
  // the edit screen branches on `queue.status` to show a brief spinner
  // while `queue.drafts` catches up, then re-renders with the prefilled
  // apology once the new draft lands. The UAT #3 fix that awaited the
  // reload before navigating cost 5–10s of perceived latency on top of
  // the (already slow) AI generation in `declineDraft`; firing-and-
  // forgetting + letting the edit screen handle the in-flight state cuts
  // the user-perceived wait to just the `declineDraft` round trip. On 409
  // `invalid_state` (commitment already cancelled, e.g. re-swipe-left),
  // no restore and a softer "already handled" toast. (TAC-298 UAT #4.)
  const handleDecline = async (
    commitment: HeadsUpCommitment,
  ): Promise<void> => {
    queue.optimisticallyRemoveCommitment(commitment.id);
    if (pendingTap?.commitmentId === commitment.id) setPendingTap(null);
    const result = await declineDraft(commitment.id);
    if (!result.ok) {
      const is409 =
        result.error.kind === 'HTTP' && result.error.status === 409;
      if (is409) {
        // Don't restore — commitment is already cancelled server-side.
        showToast('Already handled — refreshing queue');
        void queue.reload();
        return;
      }
      queue.restoreCommitment(commitment);
      showToast("Couldn't draft decline — tap to retry");
      return;
    }
    void queue.reload();
    router.push({
      pathname: '/queue/edit',
      params: { messageId: result.data.messageId },
    });
  };

  const handleUndo = (record: UndoRecord): void => {
    queue.restoreDraft(record.draft);
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
            <MetaRow cardCount={cardCount} needsInputCount={needsInputCount} />
          </View>
          {cards.length === 0 ? (
            <EmptyState />
          ) : (
            <QueueCardStack
              cards={cards}
              draftHandlers={{ onApprove: handleApprove, onEdit: handleEdit }}
              headsUpHandlers={{ onAcknowledge: handleAcknowledge, onDecline: handleDecline }}
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
