import { render, screen, fireEvent } from '@testing-library/react-native';

import { QueueCard } from '@/components/queue/queue-card';
import { type PendingDraft } from '@/lib/api/queue';

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  const now = new Date().toISOString();
  return {
    id: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guest_id: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guest_name: 'Maya R.',
    guest_phone: '+15551110001',
    recognition_band: 'returning',
    recognition_signals: ['7 visits over 4 months'],
    context_messages: [],
    current_inbound: {
      id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
      body: 'Is the patio open?',
      direction: 'inbound',
      created_at: now,
    },
    agent_draft: "Yes — patio's open until 9.",
    agent_reasoning: null,
    flag_reason: 'low fidelity score',
    pending_since: now,
    created_at: now,
    ...overrides,
  };
}

describe('QueueCard', () => {
  it('renders the guest name + recognition band', () => {
    render(
      <QueueCard
        draft={makeDraft({ recognition_band: 'raving-fan' })}
        expanded={false}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Raving Fan')).toBeTruthy();
  });

  it('falls back to guest_phone when guest_name is null', () => {
    render(
      <QueueCard
        draft={makeDraft({ guest_name: null })}
        expanded={false}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('+15551110001')).toBeTruthy();
  });

  it('renders the flag reason banner when present', () => {
    render(
      <QueueCard
        draft={makeDraft({ flag_reason: 'first message from new guest' })}
        expanded={false}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText(/first message from new guest/)).toBeTruthy();
    expect(screen.getByText(/Flagged because:/)).toBeTruthy();
  });

  it('omits the flag banner when flag_reason is null', () => {
    render(
      <QueueCard
        draft={makeDraft({ flag_reason: null })}
        expanded={false}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.queryByText(/Flagged because:/)).toBeNull();
  });

  it('reveals recognition signals when expanded', () => {
    render(
      <QueueCard
        draft={makeDraft({ recognition_signals: ['7 visits over 4 months'] })}
        expanded
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('Recognition signals')).toBeTruthy();
    expect(screen.getByText(/7 visits over 4 months/)).toBeTruthy();
  });

  it('hides recognition signals when collapsed', () => {
    render(
      <QueueCard
        draft={makeDraft({ recognition_signals: ['7 visits over 4 months'] })}
        expanded={false}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.queryByText('Recognition signals')).toBeNull();
  });

  it('fires onToggleExpanded when pressed', () => {
    const toggle = jest.fn();
    render(
      <QueueCard
        draft={makeDraft()}
        expanded={false}
        onToggleExpanded={toggle}
      />,
    );
    fireEvent.press(screen.getByRole('button'));
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
