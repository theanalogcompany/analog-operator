import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { useVenueSelection } from '@/lib/venue-context';
import { display, typePresets } from '@/lib/theme';

/**
 * The You screen's title, and — for an operator mapped to more than one venue
 * — the control that switches between them.
 *
 * The title WAS already the venue name, so making it the picker costs no new
 * chrome and no room in the top nav, whose three-column widths are load-bearing
 * for centering "Texts" under the dynamic island.
 *
 * An operator mapped to a single venue gets plain text: not a disabled control,
 * not a one-item menu. A picker that only ever has one answer is a question
 * that shouldn't have been asked.
 */
export function VenuePicker() {
  const { venues, selectedVenue, select, status } = useVenueSelection();
  const [open, setOpen] = useState(false);

  // 'loading' is genuinely "we don't know yet" and gets a placeholder rather
  // than a guess; 'error' falls through to the generic name, which is what the
  // screen showed before any of this existed.
  const title =
    selectedVenue?.name ?? (status === 'loading' ? '—' : 'Your venue');

  if (venues.length <= 1) {
    return <VenueTitle>{title}</VenueTitle>;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Venue: ${title}`}
        accessibilityHint="Switch to another venue"
        onPress={() => setOpen(true)}
        hitSlop={8}
        // Object form: structural styles are dropped in the
        // `({ pressed }) => ...` form on device.
        // Cause unknown; see the CLAUDE.md gotcha.
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <VenueTitle>{title}</VenueTitle>
        <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.75)" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss venue menu"
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 28,
            backgroundColor: 'rgba(20,17,14,0.28)',
          }}
        >
          <View
            // Stops a tap inside the panel from reaching the dismiss scrim.
            onStartShouldSetResponder={() => true}
            style={{
              alignSelf: 'stretch',
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 6,
              boxShadow: '0px 18px 44px rgba(20,17,14,0.34)',
            }}
          >
            <TrackedCaps
              {...typePresets.screenMeta}
              color="#6F6658"
              decorative
              style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}
            >
              Your venues
            </TrackedCaps>
            {venues.map((venue) => {
              const isSelected = venue.id === selectedVenue?.id;
              return (
                <Pressable
                  key={venue.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={venue.name}
                  onPress={() => {
                    select(venue.id);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 13,
                    backgroundColor: isSelected
                      ? 'rgba(28,24,20,0.06)'
                      : 'transparent',
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    className={
                      isSelected ? 'font-inter-tight-medium' : 'font-inter-tight'
                    }
                    style={{
                      flex: 1,
                      fontSize: 13,
                      letterSpacing: 0.2,
                      color: '#1C1814',
                    }}
                  >
                    {venue.name}
                  </Text>
                  {isSelected ? (
                    <Feather name="check" size={14} color="#A85638" />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function VenueTitle({ children }: { children: string }) {
  return (
    <Text
      allowFontScaling={false}
      className="font-fraunces"
      style={{
        fontSize: display.screenTitle.size,
        lineHeight: display.screenTitle.lineHeight,
        letterSpacing: display.screenTitle.tracking,
        color: '#FFFFFF',
      }}
    >
      {children}
    </Text>
  );
}
