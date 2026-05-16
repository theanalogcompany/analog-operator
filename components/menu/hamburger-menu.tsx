import { Modal, Pressable, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => void;
};

// Headless popover. Chose RN's built-in Modal over expo-router's Drawer so the
// hamburger surface works under Expo Go (Phase 1) without a config plugin.
export function HamburgerMenu({ visible, onClose, onSignOut }: Props) {
  const handleSignOut = (): void => {
    onClose();
    onSignOut();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss menu"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(28, 24, 20, 0.18)' }}
      >
        <View
          className="rounded-[12px] border-[0.5px] border-hairline bg-white"
          style={{
            position: 'absolute',
            top: 56,
            left: 18,
            paddingVertical: 6,
            minWidth: 160,
            shadowColor: '#1C1814',
            shadowOpacity: 0.12,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 18,
            elevation: 8,
          }}
          // Block backdrop press from bubbling through the panel itself.
          onStartShouldSetResponder={() => true}
        >
          <View style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={handleSignOut}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: '#C66A4A',
                borderRadius: 8,
                paddingHorizontal: 14,
                paddingVertical: 10,
                alignItems: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                className="font-inter-tight-medium text-clay"
                style={{ fontSize: 14 }}
              >
                Sign out
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
