import { render, screen, fireEvent, act } from '@testing-library/react-native';

import { UndoToast } from '@/components/queue/undo-toast';
import {
  clearUndoState,
  setUndoState,
} from '@/hooks/use-undo-state';
import { type PendingDraft } from '@/lib/api/queue';

function makeDraft(): PendingDraft {
  const now = new Date().toISOString();
  return {
    id: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guest_id: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guest_name: 'Maya R.',
    guest_phone: '+15551110001',
    recognition_band: 'returning',
    recognition_signals: [],
    context_messages: [],
    current_inbound: {
      id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
      body: 'inbound',
      direction: 'inbound',
      created_at: now,
    },
    agent_draft: 'agent reply',
    agent_reasoning: null,
    flag_reason: null,
    pending_since: now,
    created_at: now,
  };
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
    render(<UndoToast onUndo={() => {}} />);
    expect(screen.queryByText(/Sent/)).toBeNull();
  });

  it('renders "Sent" + UNDO when an approve is pending', async () => {
    render(<UndoToast onUndo={() => {}} />);
    await act(async () => {
      await setUndoState({ action: 'approve', draft: makeDraft() });
    });
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByLabelText('Undo')).toBeTruthy();
  });

  it('renders "Sent your version" for edit, "Dismissed" for skip', async () => {
    const { rerender } = render(<UndoToast onUndo={() => {}} />);
    await act(async () => {
      await setUndoState({ action: 'edit', draft: makeDraft(), body: 'rewritten' });
    });
    expect(screen.getByText('Sent your version')).toBeTruthy();

    await act(async () => {
      await clearUndoState();
      await setUndoState({ action: 'skip', draft: makeDraft() });
    });
    rerender(<UndoToast onUndo={() => {}} />);
    expect(screen.getByText('Dismissed')).toBeTruthy();
  });

  it('fires onUndo with the active record when UNDO is tapped', async () => {
    const draft = makeDraft();
    const onUndo = jest.fn();
    render(<UndoToast onUndo={onUndo} />);
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
      message_id: draft.id,
      draft,
    });
  });
});
