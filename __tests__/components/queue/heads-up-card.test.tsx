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

  it('renders fetched inbound messages once getThread resolves', async () => {
    getThreadMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'I promised the latte earlier',
          createdAt: '2026-05-30T15:50:00.000Z',
        },
      ],
    });
    render(<HeadsUpCard commitment={makeCommitment()} />);
    await waitFor(() => {
      expect(screen.getByText('I promised the latte earlier')).toBeTruthy();
    });
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
