import * as Haptics from 'expo-haptics';

type Haptic = {
  /** The drag crossed the 80px commit threshold. */
  swipeThresholdCrossed: () => void;
  swipeRightSuccess: () => void;
  swipeRefused: () => void;
  swipeLeftEdit: () => void;
  undoTriggered: () => void;
};

export function useHaptics(): Haptic {
  return {
    // Light, because it is a preview of a decision rather than the decision.
    // It fires mid-gesture, potentially several times if the operator
    // hesitates across the line, so anything heavier would nag.
    swipeThresholdCrossed: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    swipeRightSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    // A refused swipe must NOT feel like a completed one. Warning, not
    // Success — the blank-card swipe previously fired the success notification
    // on its way to doing nothing, which is the same lie the fly-off told.
    // (TAC-312.)
    swipeRefused: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
    swipeLeftEdit: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    undoTriggered: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  };
}
