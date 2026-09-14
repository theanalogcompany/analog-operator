import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UndoToast } from '@/components/queue/undo-toast';
import {
  clearUndoState,
  setUndoState,
} from '@/hooks/use-undo-state';
import { type PendingDraft } from '@/lib/api/queue';

function makeDraft(): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    draftBody: 'agent reply',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
  };
}

// The toast pins itself above the home indicator, so it reads safe-area insets.
const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
function withSafeArea(ui: React.ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
}

describe('UndoToast', () => {
  beforeEach(async () => {
    await clearUndoState();
  });

  afterEach(async () => {
    // clearUndoState() runs notify() which calls setState on any mounted
    // UndoToast. RNTL's auto-cleanup unmounts later (separate afterEach),
    // so without act() here the setState fires on a still-mounted component
    // outside React's test scope and warns.
    await act(async () => {
      await clearUndoState();
    });
  });

  it('renders nothing when there is no undo state', () => {
    render(withSafeArea(<UndoToast onUndo={() => {}} />));
    expect(screen.queryByText(/Sent/)).toBeNull();
  });

  it('renders "Sent" + UNDO when an approve is pending', async () => {
    render(withSafeArea(<UndoToast onUndo={() => {}} />));
    await act(async () => {
      await setUndoState({ action: 'approve', draft: makeDraft() });
    });
    // The redesign names the guest, so the operator can tell which send they
    // are about to undo when two land close together.
    expect(screen.getByText(/Sent to Maya R\./)).toBeTruthy();
    expect(screen.getByLabelText('Undo')).toBeTruthy();
  });

  it('renders "Sent your version" for edit, "Dismissed" for skip', async () => {
    const { rerender } = render(withSafeArea(<UndoToast onUndo={() => {}} />));
    await act(async () => {
      await setUndoState({ action: 'edit', draft: makeDraft(), body: 'rewritten' });
    });
    expect(screen.getByText(/Sent your version to Maya R\./)).toBeTruthy();

    await act(async () => {
      await clearUndoState();
      await setUndoState({ action: 'skip', draft: makeDraft() });
    });
    rerender(withSafeArea(<UndoToast onUndo={() => {}} />));
    expect(screen.getByText(/Dismissed to Maya R\./)).toBeTruthy();
  });

  // TAC-382: the undo window survives a venue switch, so the toast can outlive
  // the venue it belongs to. When it does, it has to say so — otherwise it
  // reads "Sent to Maya R." over a different venue's queue and, on undo,
  // restores a card the operator never sees come back.
  describe('cross-venue label', () => {
    it('names the venue when the record belongs to another one', async () => {
      const draft = makeDraft();
      render(
        withSafeArea(
          <UndoToast onUndo={() => {}} crossVenueName={() => 'Mock Central Perk'} />,
        ),
      );
      await act(async () => {
        await setUndoState({ action: 'approve', draft });
      });
      expect(
        screen.getByText(/to Maya R\. at Mock Central Perk/),
      ).toBeTruthy();
    });

    it('adds nothing when the record is for the venue on screen', async () => {
      const draft = makeDraft();
      render(
        withSafeArea(<UndoToast onUndo={() => {}} crossVenueName={() => null} />),
      );
      await act(async () => {
        await setUndoState({ action: 'approve', draft });
      });
      expect(screen.getByText(/to Maya R\./)).toBeTruthy();
      expect(screen.queryByText(/ at /)).toBeNull();
    });

    it('is asked about the record’s own venue, not the selected one', async () => {
      const draft = makeDraft();
      const crossVenueName = jest.fn().mockReturnValue(null);
      render(
        withSafeArea(
          <UndoToast onUndo={() => {}} crossVenueName={crossVenueName} />,
        ),
      );
      await act(async () => {
        await setUndoState({ action: 'approve', draft });
      });
      expect(crossVenueName).toHaveBeenCalledWith(draft.venueId);
    });
  });

  it('fires onUndo with the active record when UNDO is tapped', async () => {
    const draft = makeDraft();
    const onUndo = jest.fn();
    render(withSafeArea(<UndoToast onUndo={onUndo} />));
    await act(async () => {
      await setUndoState({ action: 'approve', draft });
    });
    // The press handler kicks off `void clearUndoState()`; if we don't wrap
    // the press in act(), notify() runs after the test body returns and
    // calls setState on a still-mounted UndoToast outside act → warning.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Undo'));
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo.mock.calls[0][0]).toMatchObject({
      action: 'approve',
      message_id: draft.messageId,
      draft,
    });
  });
});
