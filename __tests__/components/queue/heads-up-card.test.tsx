import { render, screen, waitFor } from '@testing-library/react-native';

import { HeadsUpCard } from '@/components/queue/heads-up-card';
import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { getThread } from '@/lib/api/queue';

jest.mock('@/lib/api/queue', () => {
  const actual = jest.requireActual('@/lib/api/queue');
  return {
    ...actual,
    getThread: jest.fn(),
  };
});

const getThreadMock = getThread as jest.Mock;

function makeCommitment(
  overrides: Partial<HeadsUpCommitment> = {},
): HeadsUpCommitment {
  return {
    id: 'aabbccdd-1111-4222-8333-444455556666',
    type: 'comp',
    guestName: 'Maya',
    description: 'oat latte on the house',
    code: '7K2P',
    expectedArrival: null,
    createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    recognitionState: 'returning',
    sourceMessageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    ...overrides,
  };
}

beforeEach(() => {
  getThreadMock.mockReset();
  getThreadMock.mockResolvedValue({ ok: true, data: [] });
});

describe('HeadsUpCard — header + recognition pill', () => {
  it('renders the guest name (Fraunces) in the header', () => {
    render(<HeadsUpCard commitment={makeCommitment()} />);
    expect(screen.getByText('Maya')).toBeTruthy();
  });

  it('renders the recognition pill when recognitionState is present', () => {
    render(<HeadsUpCard commitment={makeCommitment({ recognitionState: 'raving_fan' })} />);
    expect(screen.getByText('Raving Fan')).toBeTruthy();
  });

  it('omits the recognition pill when recognitionState is null (graceful degradation)', () => {
    render(<HeadsUpCard commitment={makeCommitment({ recognitionState: null })} />);
    // None of the recognition state labels should appear.
    expect(screen.queryByText('Raving Fan')).toBeNull();
    expect(screen.queryByText('Returning')).toBeNull();
    expect(screen.queryByText('Regular')).toBeNull();
    expect(screen.queryByText('New')).toBeNull();
  });

  it('falls back to "a guest" when guestName is empty', () => {
    render(<HeadsUpCard commitment={makeCommitment({ guestName: '' })} />);
    expect(screen.getByText('a guest')).toBeTruthy();
  });
});

describe('HeadsUpCard — flagged-because + code chip', () => {
  it('renders the "Flagged because:" templated copy', () => {
    render(<HeadsUpCard commitment={makeCommitment()} />);
    expect(screen.getByText(/Flagged because:/)).toBeTruthy();
    expect(screen.getByText(/oat latte on the house/)).toBeTruthy();
  });

  it('renders the code chip for comp type', () => {
    render(<HeadsUpCard commitment={makeCommitment({ type: 'comp', code: '7K2P' })} />);
    expect(screen.getByText('Code 7K2P')).toBeTruthy();
  });

  it('omits the code chip for recommendation type (code is null)', () => {
    render(
      <HeadsUpCard
        commitment={makeCommitment({ type: 'recommendation', code: null })}
      />,
    );
    expect(screen.queryByText(/Code/)).toBeNull();
  });
});

describe('HeadsUpCard — "No action needed" resting state', () => {
  it('renders the status line with the guest name', () => {
    render(<HeadsUpCard commitment={makeCommitment()} />);
    expect(
      screen.getByText(/No action needed — Analog already confirmed with Maya/),
    ).toBeTruthy();
  });
});

describe('HeadsUpCard — thread fetch on mount (conditional on sourceMessageId)', () => {
  it('calls getThread when sourceMessageId is present', () => {
    render(<HeadsUpCard commitment={makeCommitment()} />);
    expect(getThreadMock).toHaveBeenCalledWith(
      '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    );
  });

  it('does NOT call getThread when sourceMessageId is null (graceful degradation)', () => {
    render(<HeadsUpCard commitment={makeCommitment({ sourceMessageId: null })} />);
    expect(getThreadMock).not.toHaveBeenCalled();
  });

  it('renders the source message inline once getThread resolves', async () => {
    // The bubble that renders inline is the one whose id matches
    // sourceMessageId — that's the inbound that triggered the commitment,
    // the context the operator needs to see.
    getThreadMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'omw walking over now',
          createdAt: '2026-05-30T15:50:00.000Z',
        },
      ],
    });
    render(<HeadsUpCard commitment={makeCommitment()} />);
    await waitFor(() => {
      expect(screen.getByText('omw walking over now')).toBeTruthy();
    });
  });

  it('renders ONLY the source message when getThread returns a multi-message thread (TAC-298 UAT #2 regression guard)', async () => {
    // The server's `/thread` endpoint returns the FULL conversation (TAC-277).
    // The card MUST NOT render every message inline — on a real pilot guest
    // that's dozens of bubbles spanning days, which collapses the card into
    // a screen-dominating wall of message bubbles. The fix filters to the
    // SINGLE message whose id matches sourceMessageId; this test asserts the
    // unrelated history bubbles never render.
    getThreadMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'omw walking over now',
          createdAt: '2026-05-30T15:50:00.000Z',
        },
        {
          id: 'aa11aaaa-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'hello from days ago',
          createdAt: '2026-05-28T10:00:00.000Z',
        },
        {
          id: 'bb22bbbb-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'outbound',
          body: 'thanks for stopping by',
          createdAt: '2026-05-28T10:05:00.000Z',
        },
      ],
    });
    render(<HeadsUpCard commitment={makeCommitment()} />);
    await waitFor(() => {
      expect(screen.getByText('omw walking over now')).toBeTruthy();
    });
    // Historical bubbles do NOT render — only the source message bubble does.
    expect(screen.queryByText('hello from days ago')).toBeNull();
    expect(screen.queryByText('thanks for stopping by')).toBeNull();
  });

  it('renders no thread block when source message id is absent from the response (graceful drift)', async () => {
    // Server drift / deleted row: sourceMessageId not in the returned thread.
    // Render no thread block — FlaggedBecause + CodeChip carry the context.
    getThreadMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: 'cccccccc-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'unrelated message',
          createdAt: '2026-05-30T15:50:00.000Z',
        },
      ],
    });
    render(<HeadsUpCard commitment={makeCommitment()} />);
    // Other card content still renders; the unrelated message does not.
    expect(screen.getByText('Maya')).toBeTruthy();
    expect(screen.queryByText('unrelated message')).toBeNull();
  });

  it('leaves the thread block empty when getThread errors (graceful degradation)', async () => {
    getThreadMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'oops' },
    });
    render(<HeadsUpCard commitment={makeCommitment()} />);
    // Other card content still renders.
    expect(screen.getByText('Maya')).toBeTruthy();
    expect(
      screen.getByText(/No action needed/),
    ).toBeTruthy();
  });
});
