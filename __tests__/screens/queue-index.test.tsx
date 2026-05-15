import { render, screen } from '@testing-library/react-native';

import QueueScreen from '@/app/queue/index';
import { type UseQueueResult } from '@/hooks/use-queue';

type SessionStub = { status: 'signed-in'; session: { user: { email: string | null } } };

const mockQueue: UseQueueResult = {
  drafts: [],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
};

let mockSession: SessionStub = {
  status: 'signed-in',
  session: { user: { email: 'jaipal@theanalog.company' } },
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/app/queue/_layout', () => ({ useQueueContext: () => mockQueue }));
jest.mock('@/lib/auth/use-session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('@/components/queue/queue-card-stack', () => ({
  QueueCardStack: () => null,
}));
jest.mock('@/components/queue/undo-toast', () => ({ UndoToast: () => null }));
jest.mock('@/components/queue/empty-state', () => {
  const { Text } = jest.requireActual('react-native');
  return { EmptyState: () => <Text>empty-state-mock</Text> };
});

beforeEach(() => {
  mockQueue.drafts = [];
  mockSession = {
    status: 'signed-in',
    session: { user: { email: 'jaipal@theanalog.company' } },
  };
});

describe('QueueScreen header surface', () => {
  it('renders the new wordmark and hides the legacy header', () => {
    render(<QueueScreen />);
    expect(screen.getByText('the analog company')).toBeTruthy();
    expect(screen.queryByText(/PENDING/)).toBeNull();
  });

  it('renders the greeting with the operator first name derived from email', () => {
    render(<QueueScreen />);
    expect(screen.getByText(/Good (morning|afternoon|evening), Jaipal\./)).toBeTruthy();
  });

  it('falls back to a nameless greeting when email is null', () => {
    mockSession = {
      status: 'signed-in',
      session: { user: { email: null } },
    };
    render(<QueueScreen />);
    expect(screen.getByText(/Good (morning|afternoon|evening)\./)).toBeTruthy();
  });

  it('renders the drafts + need-your-input meta row (no sent-today segment)', () => {
    mockQueue.drafts = [
      {
        messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueSlug: 'mock',
        guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        guestDisplayName: 'A',
        guestPhoneFallback: '+15550001',
        draftBody: 'x',
        category: null,
        voiceFidelity: null,
        reviewReason: 'low fidelity',
        recognitionState: null,
        pendingSinceMs: 1,
        recentContext: [],
        langfuseTraceId: null,
      },
      {
        messageId: '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueSlug: 'mock',
        guestId: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        guestDisplayName: 'B',
        guestPhoneFallback: '+15550002',
        draftBody: 'y',
        category: null,
        voiceFidelity: null,
        reviewReason: null,
        recognitionState: null,
        pendingSinceMs: 1,
        recentContext: [],
        langfuseTraceId: null,
      },
    ];
    render(<QueueScreen />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('drafts')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('need your input')).toBeTruthy();
    expect(screen.queryByText(/sent today/)).toBeNull();
  });

  it('renders the footer copy', () => {
    render(<QueueScreen />);
    expect(screen.getByText(/Need help\?/)).toBeTruthy();
    expect(screen.getByText('Chat with Jaipal')).toBeTruthy();
  });
});
