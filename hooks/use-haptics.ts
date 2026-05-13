import * as Haptics from 'expo-haptics';

type Haptic = {
  swipeRightSuccess: () => void;
  swipeLeftEdit: () => void;
  undoTriggered: () => void;
};

export function useHaptics(): Haptic {
  return {
    swipeRightSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    swipeLeftEdit: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    undoTriggered: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  };
}
