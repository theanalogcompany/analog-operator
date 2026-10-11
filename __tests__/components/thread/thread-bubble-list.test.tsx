import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { type ThreadItem } from '@/lib/thread-cluster';
import { dividerBacking } from '@/lib/theme';

const ITEMS: ThreadItem[] = [
  { kind: 'timestamp', key: 'ts-1', label: 'Fri Sep 5 · 8:00 PM' },
  {
    kind: 'bubble',
    key: 'b-1',
    position: 'only',
    message: { id: '1', direction: 'inbound', body: 'hey there', createdAt: '2026-09-05T20:00:00.000Z' },
  },
  {
    kind: 'bubble',
    key: 'b-2',
    position: 'only',
    message: { id: '2', direction: 'outbound', body: 'hi!', createdAt: '2026-09-05T20:01:00.000Z' },
  },
];

describe('ThreadBubbleList', () => {
  it('renders the timestamp label', () => {
    render(<ThreadBubbleList items={ITEMS} />);
    // Dividers render as tracked caps; the un-uppercased string stays as the
    // accessibility label so VoiceOver doesn't spell it out.
    expect(screen.getByText('FRI SEP 5 · 8:00 PM')).toBeTruthy();
    expect(screen.getByLabelText('Fri Sep 5 · 8:00 PM')).toBeTruthy();
  });

  it('renders both bubble bodies', () => {
    render(<ThreadBubbleList items={ITEMS} />);
    expect(screen.getByText('hey there')).toBeTruthy();
    expect(screen.getByText('hi!')).toBeTruthy();
  });

  // The value is justified by __tests__/lib/ground-contrast.test.ts. This checks
  // the backing reaches the screen, and only the one that needs it. (TAC-364.)
  it('backs a divider on the edit takeover, where it sits on a card ground', () => {
    render(<ThreadBubbleList items={ITEMS} surface="card" />);
    const backing = screen.getByTestId('thread-divider-backing');
    expect(StyleSheet.flatten(backing.props.style).backgroundColor).toBe(dividerBacking.color);
    expect(within(backing).getByText('FRI SEP 5 · 8:00 PM')).toBeTruthy();
  });

  it('leaves the Texts thread unbacked, since clay clears 4.5:1 alone', () => {
    render(<ThreadBubbleList items={ITEMS} surface="thread" />);
    expect(screen.queryByTestId('thread-divider-backing')).toBeNull();
    expect(screen.getByText('FRI SEP 5 · 8:00 PM')).toBeTruthy();
  });

  // TAC-583. A media item is drawn by `MediaBubble`, whose own behaviour is
  // pinned in __tests__/components/ui/media-bubble.test.tsx. This checks the
  // list hands it over, with the surface and the expiry callback.
  describe('media items', () => {
    const PHOTO_ITEMS: ThreadItem[] = [
      { kind: 'timestamp', key: 'ts-p', label: 'Sun Oct 11 · 5:12 PM' },
      {
        kind: 'media',
        key: 'm-p',
        message: {
          id: 'p',
          direction: 'inbound',
          body: '',
          createdAt: '2026-10-11T17:12:33.000Z',
          unsupported: false,
          attachments: [
            {
              id: 'a1',
              kind: 'image',
              status: 'ready',
              url: 'https://project.supabase.co/storage/v1/object/sign/guest-media/a1',
              // Long past, so a load error asks for a refetch.
              urlExpiresAt: '2026-10-11T18:12:33.000Z',
              mimeType: 'image/jpeg',
              title: null,
              linkUrl: null,
            },
          ],
        },
      },
    ];

    it('draws a media item as media, with no text bubble for its empty body', () => {
      render(<ThreadBubbleList items={PHOTO_ITEMS} />);
      expect(screen.getByTestId('media-image')).toBeTruthy();
      expect(screen.getAllByTestId('media-bubble')).toHaveLength(1);
    });

    it('passes a load error after expiry up to the screen, with the attachment id', () => {
      jest.useFakeTimers().setSystemTime(Date.parse('2026-10-11T19:30:00.000Z'));
      const onMediaUrlExpired = jest.fn();
      render(<ThreadBubbleList items={PHOTO_ITEMS} onMediaUrlExpired={onMediaUrlExpired} />);
      fireEvent(screen.getByTestId('media-image'), 'error', {});
      expect(onMediaUrlExpired).toHaveBeenCalledWith('a1');
      jest.useRealTimers();
    });

    it('still draws the text bubbles around it', () => {
      render(<ThreadBubbleList items={[...ITEMS, ...PHOTO_ITEMS]} />);
      expect(screen.getByText('hey there')).toBeTruthy();
      expect(screen.getByTestId('media-image')).toBeTruthy();
    });
  });
});
