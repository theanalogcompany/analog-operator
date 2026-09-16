import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { EmptyState } from '@/components/queue/empty-state';
import { dividerBacking } from '@/lib/theme';

describe('EmptyState', () => {
  it('renders the all-caught-up headline', () => {
    render(<EmptyState />);
    expect(screen.getByText('You’re all caught up.')).toBeTruthy();
  });

  it('renders an intentional supporting line', () => {
    render(<EmptyState />);
    expect(
      screen.getByText('Nothing pending review. Guests are being handled. Take a breath.'),
    ).toBeTruthy();
  });

  it('renders the conversations-tab copy when variant is "conversations"', () => {
    render(<EmptyState variant="conversations" />);
    expect(screen.getByText('Nothing here right now.')).toBeTruthy();
    expect(
      screen.getByText("No conversations match that filter. Loosen it and they'll come back."),
    ).toBeTruthy();
  });

  it('still renders the default queue copy when no variant is passed', () => {
    render(<EmptyState />);
    expect(screen.getByText('You’re all caught up.')).toBeTruthy();
  });

  // TAC-411. One line, and specifically NOT "No messages yet": an operator
  // holding a pending card for this guest opens the thread and finds it
  // empty, and "no messages" would tell them nothing exists while the card in
  // their hand says otherwise. Messages exist; none has reached the guest.
  describe('thread variant', () => {
    it('renders the one line and no supporting copy', () => {
      render(<EmptyState variant="thread" />);
      expect(screen.getByText('Nothing has reached this guest yet.')).toBeTruthy();
      expect(screen.queryByText(/No messages yet/)).toBeNull();
      expect(screen.queryByText(/filter/)).toBeNull();
      expect(screen.queryByText(/caught up/)).toBeNull();
    });

    // The contrast test computes the backed figure from the token, so on its
    // own it would still pass if the component stopped rendering the backing.
    // These tie the two together. (TAC-411, SR-1.)
    it('puts the line on the dividers\' scrim when backed', () => {
      render(<EmptyState variant="thread" backed />);
      const backing = screen.getByTestId('empty-state-backing');
      expect(backing.props.style).toMatchObject({
        backgroundColor: dividerBacking.color,
        borderRadius: dividerBacking.radiusPx,
      });
    });

    it('renders no backing when not backed', () => {
      render(<EmptyState variant="thread" />);
      expect(screen.queryByTestId('empty-state-backing')).toBeNull();
    });

    // Kills the mutation that reverts `{copy.body ? … : null}` to an
    // unconditional <Text>: RN renders <Text>{undefined}</Text> as an empty
    // text box, which no copy assertion sees but which adds a line plus the
    // 16pt gap under the headline.
    it('renders exactly one Text, with no empty text node under it', () => {
      // Structural on purpose: `<Text>{undefined}</Text>` matches no text
      // query, so a copy assertion cannot see it — but it still lays out a
      // line plus the 16pt gap under the headline.
      render(<EmptyState variant="thread" />);
      expect(screen.UNSAFE_getAllByType(Text)).toHaveLength(1);
      // The variants that do have a supporting line still render both.
      screen.unmount();
      render(<EmptyState variant="queue" />);
      expect(screen.UNSAFE_getAllByType(Text)).toHaveLength(2);
    });

    it('carries no em dash', () => {
      render(<EmptyState variant="thread" />);
      expect(screen.queryByText(/\u2014/)).toBeNull();
    });
  });
});
