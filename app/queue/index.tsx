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
import {
  type HeadsUpCommitment,
  type PendingDraft,
  acknowledgeCommitment,
  approveDraft,
  declineCommitment,
  isCommitmentGone,
  undoAction,
} from '@/lib/api/queue';
import {
  buildDeclineHandoffDraft,
  stageDeclineHandoff,
} from '@/lib/decline-handoff';
import { openHelpSms } from '@/lib/help';
import { setBadgeCount } from '@/lib/notifications/badge';
import {
  type TapTarget,
  consumePendingTap,
  subscribeToTaps,
} from '@/lib/notifications/tap-handler';
import {
  buildQueueItems,
  headsUpItemKey,
  surfaceTappedItem,
} from '@/lib/queue-items';
import { HEADS_UP_TONE, groundForTone, toneFor } from '@/lib/queue-tone';
import { useQueueContext } from '@/lib/queue-context';
import { useVenueSelection } from '@/lib/venue-context';
import { display, layout, typePresets } from '@/lib/theme';

// One string for both refusal paths — the gesture refusal (TAC-312) and the
// defense-in-depth guard in `handleApprove` (TAC-310). They fire on the same
// condition and must say the same thing.
const NOTHING_TO_SEND_MESSAGE =
  'Nothing to send yet — swipe left to write your answer';

// Heads-up card copy. No em dashes: it is read fast mid-shift. (TAC-364.)
const ACKNOWLEDGE_FAILED_MESSAGE = "Couldn't acknowledge that. Try again.";
const DECLINE_WRITING_MESSAGE = 'Writing the decline…';
const DECLINE_FAILED_MESSAGE = "Couldn't write the decline. Try again.";
const ALREADY_HANDLED_MESSAGE = 'That one was already handled.';

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
  const [surfacedTarget, setSurfacedTarget] = useState<TapTarget | null>(null);
  // The heads-up card whose decline the server is writing, if any. Its gesture
  // is off until the response lands, so a second swipe can't start a second
  // decline.
  const [decliningId, setDecliningId] = useState<string | null>(null);

  // Drain any pending notification-tap on mount (cold-launch case) and subscribe
  // for warm-launch taps that land while the queue is mounted. Surfacing reorders
  // the deck so the tapped card lands on top for this mount; normal order
  // resumes once that card is dispatched. Per TAC-288 settled-decision #4,
  // extended by TAC-364 so an arrival push surfaces its own heads-up card.
  useEffect(() => {
    const pending = consumePendingTap();
    if (pending) setSurfacedTarget(pending);
    return subscribeToTaps((target) => {
      consumePendingTap();
      setSurfacedTarget(target);
    });
  }, []);

  // One deck, two kinds of card (see lib/queue-items.ts). If the tapped card is
  // no longer in the queue (handled on another device, or just dispatched
  // here), the deck keeps its natural order.
  const items = useMemo(
    () => buildQueueItems(queue.drafts, queue.commitments),
    [queue.drafts, queue.commitments],
  );
  const displayItems = useMemo(
    () => surfaceTappedItem(items, surfacedTarget),
    [items, surfacedTarget],
  );

  const visibleIds = useMemo(
    () => displayItems.map((item) => item.key),
    [displayItems],
  );
  // Scoped to the venue: cards seen at one venue must not inflate another's
  // denominator after a switch. (TAC-382.)
  const progress = useSessionProgress(visibleIds, venue.selectedVenueId);

  const top = displayItems[0];
  // The ground encodes why the top card was flagged, so the operator knows what
  // kind of decision is in front of them before reading a word. With an empty
  // deck there is no decision, so it settles to clay — `resting`, which must
  // also be the entrance's ground; see CLAUDE.md. (TAC-384.)
  const groundName = top
    ? groundForTone(top.kind === 'draft' ? toneFor(top.draft) : HEADS_UP_TONE)
    : 'resting';

  // A tapped notification may be for a guest at a venue that isn't the one on
  // screen. Neither APNs payload carries a venueId (see lib/notifications/
  // tap-handler.ts), so the venue is resolved here, from the queue, once the
  // card is actually in hand — which is why this is its own effect rather
  // than part of the subscribe effect above: on a cold launch the tap lands
  // before the first listQueue() resolves, and this re-runs when it does.
  //
  // Switching is the right failure mode. Doing nothing would leave the
  // operator staring at a queue that doesn't contain the guest they just
  // tapped, with no explanation — and a guest is waiting either way. The
  // toast is what makes the switch visible rather than mysterious.
  const { findVenueIdForGuest } = queue;
  const { selectedVenueId, select: selectVenue, venues } = venue;
  const surfacedGuestId = surfacedTarget?.guestId ?? null;
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

  // Badge mirrors the visible queue, heads-up cards included (the server's push
  // badge counts pending_ack commitments too). Sync on every change (covers
  // swipes, restores, realtime updates and reloads) and on foreground
  // transitions (covers server-driven badge updates that drift from the local
  // count while the app was backgrounded). Queue length is the source of truth
  // — brief divergence under the TAC-37 undo flow is by design.
  const pendingCount = queue.drafts.length + queue.commitments.length;
  useEffect(() => {
    void setBadgeCount(pendingCount);
  }, [pendingCount]);

  // Track the latest count in a ref so the AppState subscription stays mounted
  // across re-renders. Subscribing on every count change would tear down and
  // re-attach the listener for no benefit.
  const pendingCountRef = useRef(pendingCount);
  pendingCountRef.current = pendingCount;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void setBadgeCount(pendingCountRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  const clearSurfaceForDraft = (draft: PendingDraft): void => {
    if (surfacedTarget?.kind === 'draft' && surfacedTarget.guestId === draft.guestId) {
      setSurfacedTarget(null);
    }
  };

  const clearSurfaceForCommitment = (commitment: HeadsUpCommitment): void => {
    if (
      surfacedTarget?.kind === 'commitment' &&
      surfacedTarget.commitmentId === commitment.id
    ) {
      setSurfacedTarget(null);
    }
  };

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
    clearSurfaceForDraft(draft);
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
    clearSurfaceForDraft(draft);
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

  // Heads-up swipe-right. Acknowledging tells the server the operator knows the
  // guest is coming, and that is all it does: nothing is sent to the guest.
  // There is no server-side undo for it, so it takes no undo record. (TAC-364.)
  const handleAcknowledge = async (commitment: HeadsUpCommitment): Promise<void> => {
    const key = headsUpItemKey(commitment.id);
    queue.optimisticallyRemoveCommitment(commitment.id);
    progress.markCleared(key);
    clearSurfaceForCommitment(commitment);
    const result = await acknowledgeCommitment(commitment.id);
    if (result.ok) return;
    // Acknowledged or declined somewhere else already: the card was stale, so
    // clearing it was right and there is nothing to retry.
    if (isCommitmentGone(result.error)) return;
    queue.restoreCommitment(commitment);
    progress.markRestored(key);
    showToast(ACKNOWLEDGE_FAILED_MESSAGE);
  };

  // Heads-up swipe-left. The server writes an apology, persists it as a PENDING
  // draft and cancels the commitment; nothing is sent. The operator reviews that
  // draft on the existing edit takeover, which is the only place it can be sent
  // from. The swipe itself never dispatches a message. (TAC-364, TAC-299.)
  const handleDecline = async (commitment: HeadsUpCommitment): Promise<void> => {
    if (decliningId) return;
    setDecliningId(commitment.id);
    showToast(DECLINE_WRITING_MESSAGE);
    const result = await declineCommitment(commitment.id);
    setDecliningId(null);
    if (!result.ok) {
      if (isCommitmentGone(result.error)) {
        queue.optimisticallyRemoveCommitment(commitment.id);
        progress.markCleared(headsUpItemKey(commitment.id));
        clearSurfaceForCommitment(commitment);
        showToast(ALREADY_HANDLED_MESSAGE);
        return;
      }
      showToast(DECLINE_FAILED_MESSAGE);
      return;
    }
    queue.optimisticallyRemoveCommitment(commitment.id);
    progress.markCleared(headsUpItemKey(commitment.id));
    clearSurfaceForCommitment(commitment);
    // The takeover resolves its draft from the queue, which cannot hold a row
    // the server created moments ago; the staged handoff stands in until the
    // realtime reload delivers it. See lib/decline-handoff.ts.
    stageDeclineHandoff(buildDeclineHandoffDraft(commitment, result.data));
    router.push({
      pathname: '/queue/edit',
      params: {
        messageId: result.data.messageId,
        prefill: result.data.body,
        tone: HEADS_UP_TONE,
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
    // Constant on purpose: the entrance fades to clay whatever the queue
    // returns and however fast. See `entranceGround`. (TAC-384.)
    <GroundScreen name={groundName} entranceGround="resting">
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
      ) : displayItems.length === 0 ? (
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
          items={displayItems}
          position={progress.position}
          total={progress.total}
          busyKey={decliningId ? headsUpItemKey(decliningId) : null}
          onApprove={handleApprove}
          onEdit={handleEdit}
          onRefuseApprove={handleRefuseApprove}
          onAcknowledge={handleAcknowledge}
          onDecline={handleDecline}
          onPressHelp={handleHelp}
        />
      )}

      <UndoToast onUndo={handleUndo} crossVenueName={crossVenueName} />
    </GroundScreen>
  );
}
