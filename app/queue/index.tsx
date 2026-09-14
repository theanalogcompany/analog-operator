import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { GroundScreen } from '@/components/ground/ground-screen';
import { EmptyState } from '@/components/queue/empty-state';
import { QueueCardStack } from '@/components/queue/queue-card-stack';
import { UndoToast } from '@/components/queue/undo-toast';
import { TopNav } from '@/components/shell/top-nav';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import {
  type UndoRecord,
  clearUndoState,
  setUndoState,
} from '@/hooks/use-undo-state';
import { useSessionProgress } from '@/hooks/use-session-progress';
import { type PendingDraft, approveDraft, undoAction } from '@/lib/api/queue';
import { openHelpSms } from '@/lib/help';
import { setBadgeCount } from '@/lib/notifications/badge';
import {
  consumePendingTap,
  subscribeToTaps,
} from '@/lib/notifications/tap-handler';
import { groundForTone, toneFor } from '@/lib/queue-tone';
import { useQueueContext } from '@/lib/queue-context';
import { useVenueSelection } from '@/lib/venue-context';
import { display, layout, typePresets } from '@/lib/theme';

// One string for both refusal paths — the gesture refusal (TAC-312) and the
// defense-in-depth guard in `handleApprove` (TAC-310). They fire on the same
// condition and must say the same thing.
const NOTHING_TO_SEND_MESSAGE =
  'Nothing to send yet — swipe left to write your answer';

function handleHelp(): void {
  void openHelpSms().then((result) => {
    if (!result.ok) showToast("Couldn't open Messages");
  });
}

export default function QueueScreen() {
  const queue = useQueueContext();
  const venue = useVenueSelection();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [surfacedGuestId, setSurfacedGuestId] = useState<string | null>(null);

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

  const visibleIds = useMemo(
    () => displayDrafts.map((d) => d.messageId),
    [displayDrafts],
  );
  // Scoped to the venue: cards seen at one venue must not inflate another's
  // denominator after a switch. (TAC-382.)
  const progress = useSessionProgress(visibleIds, venue.selectedVenueId);

  const top = displayDrafts[0];
  // The ground encodes why the top card was flagged, so the operator knows what
  // kind of decision is in front of them before reading a word. With an empty
  // deck there is no decision, so it settles to neutral.
  const groundName = top ? groundForTone(toneFor(top)) : 'neutral';

  // A tapped notification may be for a guest at a venue that isn't the one on
  // screen. The APNs payload carries no venueId (see lib/notifications/
  // tap-handler.ts), so the venue is resolved here, from the queue, once the
  // draft is actually in hand — which is why this is its own effect rather
  // than part of the subscribe effect above: on a cold launch the tap lands
  // before the first listQueue() resolves, and this re-runs when it does.
  //
  // Switching is the right failure mode. Doing nothing would leave the
  // operator staring at a queue that doesn't contain the guest they just
  // tapped, with no explanation — and a guest is waiting either way. The
  // toast is what makes the switch visible rather than mysterious.
  const { findVenueIdForGuest } = queue;
  const { selectedVenueId, select: selectVenue, venues } = venue;
  useEffect(() => {
    if (!surfacedGuestId) return;
    const venueId = findVenueIdForGuest(surfacedGuestId);
    if (!venueId || venueId === selectedVenueId) return;
    // Resolve the venue BEFORE announcing anything. `select` ignores a venue
    // the operator isn't mapped to, so announcing first would claim a switch
    // that never happened — and, because `selectedVenueId` would stay put, the
    // guard above would never trip and the toast would repeat on every
    // realtime-driven reload.
    const target = venues.find((v) => v.id === venueId);
    if (!target) return;
    selectVenue(target.id);
    showToast(`Switched to ${target.name}`);
  }, [surfacedGuestId, findVenueIdForGuest, selectedVenueId, selectVenue, venues]);

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
    // Defense-in-depth. Unreachable via swipe since TAC-312 — the gesture now
    // refuses a blank card outright rather than completing and relying on this
    // to block the request — but `handleApprove` is the screen's public approve
    // entry and any future caller (a button, a notification action) has to stay
    // safe. `/approve` sends no body, so the server would ship its stored blank
    // and 422. (TAC-310.)
    if (!draft.draftBody.trim()) {
      showToast(NOTHING_TO_SEND_MESSAGE);
      return;
    }
    queue.optimisticallyRemove(draft.messageId);
    progress.markCleared(draft.messageId);
    if (draft.guestId === surfacedGuestId) setSurfacedGuestId(null);
    void setUndoState({ action: 'approve', draft });
    const result = await approveDraft(draft.messageId);
    if (!result.ok) {
      queue.restore(draft);
      progress.markRestored(draft.messageId);
      void clearUndoState();
      showToast("Couldn't send — tap to retry");
    }
  };

  // The gesture declined a right-swipe on a blank card. The card is still on
  // the stack and still in `queue.drafts` — nothing to remove, nothing to
  // restore, no undo state. All this owes the operator is an explanation.
  // (TAC-312.)
  const handleRefuseApprove = (): void => {
    showToast(NOTHING_TO_SEND_MESSAGE);
  };

  const handleEdit = (draft: PendingDraft): void => {
    if (draft.guestId === surfacedGuestId) setSurfacedGuestId(null);
    router.push({
      pathname: '/queue/edit',
      params: {
        messageId: draft.messageId,
        // The takeover's ground is the card's ground, so the color carries
        // through from the card you swiped.
        tone: toneFor(draft),
      },
    });
  };

  // `queue.restore` writes into the FULL draft list, not the venue-filtered
  // view, so undoing a send made at another venue puts that draft back into
  // ITS venue's list rather than injecting it into the one on screen. That
  // cross-venue write was TAC-382's highest-priority bug; this is the fix
  // (option 1). `undoAction` is untouched — the stored `message_id` is correct
  // regardless of which venue is selected, and the undo window stays live
  // across a switch rather than being cancelled by one.
  const handleUndo = (record: UndoRecord): void => {
    queue.restore(record.draft);
    progress.markRestored(record.message_id);
    void undoAction(record.message_id);
  };

  const crossVenueName = useCallback(
    (venueId: string): string | null =>
      venueId === selectedVenueId
        ? null
        : (venues.find((v) => v.id === venueId)?.name ?? null),
    [selectedVenueId, venues],
  );

  return (
    <GroundScreen name={groundName}>
      <TopNav />

      {queue.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : queue.status === 'error' ? (
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
            We couldn&rsquo;t load the queue.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading the queue"
            onPress={() => void queue.reload()}
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
      ) : displayDrafts.length === 0 ? (
        <>
          <EmptyState />
          <View
            pointerEvents="box-none"
            style={{
              alignItems: 'center',
              paddingBottom: insets.bottom + layout.hintRowGapPx,
            }}
          >
            <Text
        allowFontScaling={false}
              accessibilityRole="link"
              accessibilityLabel="Chat with Jaipal via SMS"
              onPress={handleHelp}
              className="font-inter-tight-medium"
              style={{
                fontSize: typePresets.footer.size,
                letterSpacing: typePresets.footer.tracking,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              {'NEED HELP? '}
              <Text allowFontScaling={false} style={{ color: '#FFFFFF' }}>CHAT WITH JAIPAL</Text>
            </Text>
          </View>
        </>
      ) : (
        <QueueCardStack
          drafts={displayDrafts}
          position={progress.position}
          total={progress.total}
          onApprove={handleApprove}
          onEdit={handleEdit}
          onRefuseApprove={handleRefuseApprove}
          onPressHelp={handleHelp}
        />
      )}

      <UndoToast onUndo={handleUndo} crossVenueName={crossVenueName} />
    </GroundScreen>
  );
}
