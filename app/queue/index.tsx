import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from 'react-native';

import { showToast } from '@/components/auth/toast';
import { EmptyState } from '@/components/queue/empty-state';
import { QueueCardStack } from '@/components/queue/queue-card-stack';
import { UndoToast } from '@/components/queue/undo-toast';
import {
  type UndoRecord,
  clearUndoState,
  setUndoState,
} from '@/hooks/use-undo-state';
import { type PendingDraft, approveDraft, undoAction } from '@/lib/api/queue';

import { useQueueContext } from './_layout';

function statusBlurb(count: number): string {
  if (count === 0) return 'all clear';
  if (count === 1) return '1 pending';
  return `${count} pending`;
}

export default function QueueScreen() {
  const queue = useQueueContext();
  const router = useRouter();

  const handleApprove = async (draft: PendingDraft): Promise<void> => {
    queue.optimisticallyRemove(draft.id);
    void setUndoState({ action: 'approve', draft });
    const result = await approveDraft(draft.id);
    if (!result.ok) {
      queue.restore(draft);
      void clearUndoState();
      showToast("Couldn't send — tap to retry");
    }
  };

  const handleEdit = (draft: PendingDraft): void => {
    router.push({ pathname: '/queue/edit', params: { messageId: draft.id } });
  };

  const handleUndo = (record: UndoRecord): void => {
    queue.restore(record.draft);
    void undoAction(record.message_id);
  };

  return (
    <SafeAreaView className="flex-1 bg-sand">
      <View className="flex-row items-center justify-between px-[22px] pb-2 pt-4">
        <Text
          className="font-fraunces text-ink"
          style={{ fontSize: 22, letterSpacing: -0.44 }}
        >
          analog<Text className="text-clay">.</Text>
        </Text>
        <Text
          className="font-inter-tight uppercase text-ink-faint"
          style={{ fontSize: 11, letterSpacing: 1.54 }}
        >
          {statusBlurb(queue.drafts.length)}
        </Text>
      </View>

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
      ) : queue.drafts.length === 0 ? (
        <EmptyState />
      ) : (
        <QueueCardStack
          drafts={queue.drafts}
          onApprove={handleApprove}
          onEdit={handleEdit}
        />
      )}

      <UndoToast onUndo={handleUndo} />
    </SafeAreaView>
  );
}
