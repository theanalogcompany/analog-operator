import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer } from 'expo-video';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { MediaBubble } from '@/components/ui/media-bubble';
import { type Attachment, type ThreadMessage } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { media } from '@/lib/theme';

jest.mock('@/components/auth/toast', () => ({ showToast: jest.fn() }));

/**
 * `expo-image`, `expo-video` and `expo-audio` are stand-ins from
 * `jest.setup.js`: plain views carrying their props, and players that are bags
 * of `jest.fn()`. So what these tests can claim is WHICH tile a message gets
 * and what that tile does with a press, a load error or a touch on the
 * scrubber. Whether a photo decodes, a GIF animates, a video shows its first
 * frame or a voice note is audible is not claimable here and is the device
 * gate's job (CLAUDE.md, "Never mock the layer whose behavior you are
 * claiming").
 */

const SENT_AT = Date.parse('2026-10-11T17:12:33.000Z');
const NOW = SENT_AT + 5 * 60_000;
const SIGNED_URL =
  'https://project.supabase.co/storage/v1/object/sign/guest-media/v/g/m/a1';

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'a1',
    kind: 'image',
    status: 'ready',
    url: SIGNED_URL,
    urlExpiresAt: '2026-10-11T18:12:33.000Z',
    mimeType: 'image/jpeg',
    title: null,
    linkUrl: null,
    ...overrides,
  };
}

function message(
  attachments: Attachment[],
  overrides: Partial<ThreadMessage> = {},
): ThreadMessage {
  return {
    id: '5b0e3c1a-7d2f-4e8b-9a6c-1f0d2e3b4c5d',
    direction: 'inbound',
    body: '',
    createdAt: '2026-10-11T17:12:33.000Z',
    attachments,
    unsupported: false,
    ...overrides,
  };
}

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

function renderBubble(
  msg: ThreadMessage,
  props: Partial<React.ComponentProps<typeof MediaBubble>> = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MediaBubble message={msg} nowMs={NOW} {...props} />
    </SafeAreaProvider>,
  );
}

const mockUseAudioPlayer = useAudioPlayer as jest.Mock;
const mockUseAudioPlayerStatus = useAudioPlayerStatus as jest.Mock;
const mockUseVideoPlayer = useVideoPlayer as jest.Mock;

function mockAudio(status: {
  playing?: boolean;
  isLoaded?: boolean;
  currentTime?: number;
  duration?: number;
}) {
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  };
  mockUseAudioPlayer.mockReturnValue(player);
  mockUseAudioPlayerStatus.mockReturnValue({
    playing: false,
    isLoaded: true,
    currentTime: 0,
    duration: 7,
    ...status,
  });
  return player;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAudio({});
});

describe('MediaBubble — which tile a message gets', () => {
  it('draws a photo from its signed url', () => {
    renderBubble(message([attachment()]));
    const image = screen.getByTestId('media-image');
    expect(image.props.source).toEqual({ uri: SIGNED_URL, cacheKey: 'a1' });
    expect(screen.queryByTestId('media-video')).toBeNull();
  });

  it('draws a GIF as an animating, uncropped image', () => {
    renderBubble(
      message([
        attachment({
          id: 'a2',
          kind: 'gif',
          url: 'https://media3.giphy.com/media/abc/200.gif',
          urlExpiresAt: null,
          mimeType: 'image/gif',
        }),
      ]),
    );
    const gif = screen.getByTestId('media-gif');
    expect(gif.props.source.uri).toBe('https://media3.giphy.com/media/abc/200.gif');
    expect(gif.props.autoplay).toBe(true);
    expect(gif.props.contentFit).toBe('contain');
  });

  it('draws a video on the platform controls, from its url', () => {
    renderBubble(message([attachment({ kind: 'video', mimeType: 'video/mp4' })]));
    const video = screen.getByTestId('media-video');
    expect(video.props.nativeControls).toBe(true);
    expect(mockUseVideoPlayer).toHaveBeenCalledWith(SIGNED_URL);
  });

  /**
   * The rule Jaipal added on 2026-10-11, at the layer that mounts a player:
   * "Instagram voice notes arrive with mimeType "video/mp4" but kind "audio".
   * They must render as an audio player with duration and scrubber."
   */
  describe('a voice note whose file is video/mp4 (the production shape)', () => {
    const voiceNote = () =>
      message([attachment({ kind: 'audio', mimeType: 'video/mp4' })]);

    it('gets the audio player and no video player', () => {
      renderBubble(voiceNote());
      expect(screen.getByLabelText(CARD_COPY.media.spoken.playVoiceNote)).toBeTruthy();
      expect(screen.getByTestId('voice-note-scrubber')).toBeTruthy();
      expect(mockUseAudioPlayer).toHaveBeenCalledWith(SIGNED_URL);
      expect(screen.queryByTestId('media-video')).toBeNull();
      expect(mockUseVideoPlayer).not.toHaveBeenCalled();
    });

    it('shows its duration', () => {
      mockAudio({ duration: 83 });
      renderBubble(voiceNote());
      expect(screen.getByText('1:23')).toBeTruthy();
    });
  });

  it('gives a video whose file is audio/mp4 the video player, for the same reason', () => {
    renderBubble(message([attachment({ kind: 'video', mimeType: 'audio/mp4' })]));
    expect(screen.getByTestId('media-video')).toBeTruthy();
    expect(mockUseAudioPlayer).not.toHaveBeenCalled();
  });

  it('draws a reel share as its caption and the link out', () => {
    renderBubble(
      message([
        attachment({
          id: 'a3',
          kind: 'share',
          status: 'link_only',
          url: null,
          urlExpiresAt: null,
          mimeType: null,
          title: 'the amount of times we lost him was crazy 😂',
          linkUrl: 'https://www.instagram.com/reel/DcPVXR9vbun/',
        }),
      ]),
    );
    expect(screen.getByText('the amount of times we lost him was crazy 😂')).toBeTruthy();
    expect(screen.getByText('OPEN IN INSTAGRAM')).toBeTruthy();
  });

  it('draws a live story from Meta\'s link, uncached', () => {
    const storyUrl = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1';
    renderBubble(
      message([
        attachment({
          kind: 'story_mention',
          status: 'link_only',
          url: storyUrl,
          urlExpiresAt: new Date(SENT_AT + 24 * 60 * 60_000).toISOString(),
          mimeType: null,
        }),
      ]),
    );
    // Never written to disk: an expired story must not be drawable from cache.
    const story = screen.getByTestId('media-image');
    expect(story.props.source).toEqual({ uri: storyUrl });
    expect(story.props.cachePolicy).toBe('none');
  });

  // The four strings approved on the plan, 2026-10-11.
  it('says "Expired" for a story after its 24 hours', () => {
    renderBubble(
      message([
        attachment({
          kind: 'story_reply',
          status: 'expired',
          url: null,
          urlExpiresAt: null,
          mimeType: null,
        }),
      ]),
    );
    expect(screen.getByText('Expired')).toBeTruthy();
  });

  it('says "Couldn\'t load" for a failed attachment', () => {
    renderBubble(message([attachment({ status: 'failed', url: null })]));
    expect(screen.getByText("Couldn't load")).toBeTruthy();
  });

  it('shows a wordless loading state for a pending attachment', () => {
    renderBubble(message([attachment({ status: 'pending', url: null })]));
    expect(screen.getByLabelText(CARD_COPY.media.spoken.loading)).toBeTruthy();
    expect(screen.queryByTestId('media-image')).toBeNull();
  });

  it('says "Sent something we can\'t show." for an unsupported message', () => {
    renderBubble(message([], { unsupported: true }));
    expect(screen.getByText("Sent something we can't show.")).toBeTruthy();
  });

  it('says the same for a kind it has no way to draw', () => {
    renderBubble(message([attachment({ kind: 'file' })]));
    expect(screen.getByText("Sent something we can't show.")).toBeTruthy();
  });

  it('stacks several attachments in the order the server sent them', () => {
    renderBubble(
      message([
        attachment({ id: 'first' }),
        attachment({ id: 'second', url: `${SIGNED_URL}-2` }),
      ]),
    );
    const images = screen.getAllByTestId('media-image');
    expect(images.map((i) => i.props.source.cacheKey)).toEqual(['first', 'second']);
  });
});

describe('MediaBubble — a photo opens full screen', () => {
  it('opens on tap and closes on tap', () => {
    renderBubble(message([attachment()]));
    expect(screen.queryByTestId('media-fullscreen')).toBeNull();

    fireEvent.press(screen.getByRole('imagebutton'));
    expect(screen.getByTestId('media-fullscreen')).toBeTruthy();

    fireEvent.press(screen.getByTestId('media-fullscreen'));
    expect(screen.queryByTestId('media-fullscreen')).toBeNull();
  });
});

describe('MediaBubble — a share links out', () => {
  const share = () =>
    message([
      attachment({
        kind: 'share',
        status: 'link_only',
        url: null,
        urlExpiresAt: null,
        mimeType: null,
        title: 'a reel',
        linkUrl: 'https://www.instagram.com/reel/DcPVXR9vbun/',
      }),
    ]);

  it('opens the share\'s own link', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderBubble(share());
    fireEvent.press(screen.getByRole('link'));
    expect(openURL).toHaveBeenCalledWith('https://www.instagram.com/reel/DcPVXR9vbun/');
  });

  it('tells the operator when the link will not open', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    renderBubble(share());
    await act(async () => {
      fireEvent.press(screen.getByRole('link'));
    });
    expect(showToast).toHaveBeenCalledWith("Couldn't open Instagram.");
  });
});

describe('MediaBubble — the voice note player', () => {
  const voiceNote = () => message([attachment({ kind: 'audio', mimeType: 'video/mp4' })]);

  it('plays on tap, and unmutes the ringer switch first', () => {
    const player = mockAudio({});
    renderBubble(voiceNote());
    fireEvent.press(screen.getByLabelText(CARD_COPY.media.spoken.playVoiceNote));
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true });
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('pauses on tap while playing', () => {
    const player = mockAudio({ playing: true, currentTime: 2 });
    renderBubble(voiceNote());
    fireEvent.press(screen.getByLabelText(CARD_COPY.media.spoken.pauseVoiceNote));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('starts over when played from the end', () => {
    const player = mockAudio({ currentTime: 7, duration: 7 });
    renderBubble(voiceNote());
    fireEvent.press(screen.getByLabelText(CARD_COPY.media.spoken.playVoiceNote));
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('counts up while playing and shows the length at rest', () => {
    mockAudio({ playing: true, currentTime: 3, duration: 83 });
    const playing = renderBubble(voiceNote());
    expect(screen.getByText('0:03')).toBeTruthy();
    playing.unmount();

    mockAudio({ playing: false, currentTime: 0, duration: 83 });
    renderBubble(voiceNote());
    expect(screen.getByText('1:23')).toBeTruthy();
  });

  it('shows no length until the file reports one', () => {
    mockAudio({ isLoaded: false, duration: 0 });
    renderBubble(voiceNote());
    expect(screen.queryByText('0:00')).toBeNull();
  });

  it('seeks to where the scrubber is touched', () => {
    const player = mockAudio({ duration: 10 });
    renderBubble(voiceNote());
    const scrubber = screen.getByTestId('voice-note-scrubber');
    fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 200 } } });

    fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 50 } });
    expect(player.seekTo).toHaveBeenLastCalledWith(2.5);

    fireEvent(scrubber, 'responderMove', { nativeEvent: { locationX: 150 } });
    expect(player.seekTo).toHaveBeenLastCalledWith(7.5);
  });

  // What this checks is only that the scrubber ASKS to keep the touch. Whether
  // the thread's native ScrollView honours that on a diagonal drag is a device
  // question and is on the UAT list.
  it('claims the touch and declines to hand it back', () => {
    renderBubble(voiceNote());
    const scrubber = screen.getByTestId('voice-note-scrubber');
    expect(scrubber.props.onStartShouldSetResponder()).toBe(true);
    expect(scrubber.props.onResponderTerminationRequest()).toBe(false);
  });

  it('reports its position to VoiceOver and moves on swipe', () => {
    const player = mockAudio({ currentTime: 10, duration: 60 });
    renderBubble(voiceNote());
    const scrubber = screen.getByTestId('voice-note-scrubber');
    expect(scrubber.props.accessibilityValue).toMatchObject({ min: 0, max: 60, now: 10 });

    fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(player.seekTo).toHaveBeenLastCalledWith(10 + media.audio.accessibilityStepSec);

    fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(player.seekTo).toHaveBeenLastCalledWith(10 - media.audio.accessibilityStepSec);
  });
});

/**
 * "On a load error past `urlExpiresAt`, refetch once." (TAC-583.) The "once"
 * is the screen's (see the screen tests); the tile's half is to ask only when
 * the failure came after the url ran out.
 */
describe('MediaBubble — a load that fails', () => {
  const EXPIRY = Date.parse('2026-10-11T18:12:33.000Z');

  afterEach(() => {
    jest.useRealTimers();
  });

  function failImage() {
    fireEvent(screen.getByTestId('media-image'), 'error', {});
  }

  it('asks for a refetch when the photo fails after its url expired', () => {
    jest.useFakeTimers().setSystemTime(EXPIRY + 60_000);
    const onUrlExpired = jest.fn();
    renderBubble(message([attachment()]), { onUrlExpired });

    failImage();
    expect(onUrlExpired).toHaveBeenCalledWith('a1');
    expect(screen.getByText("Couldn't load")).toBeTruthy();
  });

  it('does not ask when the url should still be good: that is a real failure', () => {
    jest.useFakeTimers().setSystemTime(EXPIRY - 60_000);
    const onUrlExpired = jest.fn();
    renderBubble(message([attachment()]), { onUrlExpired });

    failImage();
    expect(onUrlExpired).not.toHaveBeenCalled();
    expect(screen.getByText("Couldn't load")).toBeTruthy();
  });

  it('reads the clock when the load fails, not when the thread was drawn', () => {
    // A thread opened with good urls and left open for more than an hour.
    jest.useFakeTimers().setSystemTime(EXPIRY - 50 * 60_000);
    const onUrlExpired = jest.fn();
    renderBubble(message([attachment()]), { onUrlExpired, nowMs: EXPIRY - 50 * 60_000 });

    jest.setSystemTime(EXPIRY + 60_000);
    failImage();
    expect(onUrlExpired).toHaveBeenCalledWith('a1');
  });

  it('draws the photo again when a refetch hands back a fresh url', () => {
    jest.useFakeTimers().setSystemTime(EXPIRY + 60_000);
    const view = renderBubble(message([attachment()]), { onUrlExpired: jest.fn() });
    failImage();
    expect(screen.queryByTestId('media-image')).toBeNull();

    const fresh = `${SIGNED_URL}?token=fresh`;
    view.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <MediaBubble
          message={message([
            attachment({ url: fresh, urlExpiresAt: '2026-10-11T20:12:33.000Z' }),
          ])}
          nowMs={EXPIRY + 60_000}
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('media-image').props.source.uri).toBe(fresh);
    expect(screen.queryByText("Couldn't load")).toBeNull();
  });

  /**
   * A refetch returns a fresh signed url for EVERY file. A tile that is
   * working must not notice: rebuilding its player would stop a voice note
   * mid-play because some other message in the thread changed.
   */
  describe('a refetch that brings a new url for a tile that is working', () => {
    const rerenderWith = (
      view: ReturnType<typeof renderBubble>,
      next: Attachment,
    ) =>
      view.rerender(
        <SafeAreaProvider initialMetrics={metrics}>
          <MediaBubble message={message([next])} nowMs={NOW} />
        </SafeAreaProvider>,
      );

    it('leaves a playing voice note on the url, and the player, it already has', () => {
      mockAudio({ playing: true, currentTime: 3 });
      const note = attachment({ kind: 'audio', mimeType: 'video/mp4' });
      const view = renderBubble(message([note]));

      rerenderWith(view, { ...note, url: `${SIGNED_URL}?token=fresh` });

      const urls = mockUseAudioPlayer.mock.calls.map((call) => call[0]);
      expect(new Set(urls)).toEqual(new Set([SIGNED_URL]));
    });

    it('leaves a photo, and the full-screen view of it, alone', () => {
      const view = renderBubble(message([attachment()]));
      fireEvent.press(screen.getByRole('imagebutton'));
      expect(screen.getByTestId('media-fullscreen')).toBeTruthy();

      rerenderWith(view, attachment({ url: `${SIGNED_URL}?token=fresh` }));

      expect(screen.getByTestId('media-fullscreen')).toBeTruthy();
      expect(screen.getByTestId('media-image').props.source.uri).toBe(SIGNED_URL);
    });

    it('moves to the newer url the moment the one it kept fails, without asking for another', () => {
      jest.useFakeTimers().setSystemTime(EXPIRY + 60_000);
      const onUrlExpired = jest.fn();
      const view = renderBubble(message([attachment()]), { onUrlExpired });
      const fresh = `${SIGNED_URL}?token=fresh`;
      view.rerender(
        <SafeAreaProvider initialMetrics={metrics}>
          <MediaBubble
            message={message([attachment({ url: fresh, urlExpiresAt: '2026-10-11T20:12:33.000Z' })])}
            nowMs={NOW}
            onUrlExpired={onUrlExpired}
          />
        </SafeAreaProvider>,
      );
      // Still on the old one, which has now expired and fails.
      failImage();
      expect(screen.getByTestId('media-image').props.source.uri).toBe(fresh);
      expect(onUrlExpired).not.toHaveBeenCalled();
      expect(screen.queryByText("Couldn't load")).toBeNull();
    });
  });

  it('reads "Couldn\'t load" when the video player reports an error', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const listeners: Record<string, (payload: { status: string }) => void> = {};
    mockUseVideoPlayer.mockReturnValue({
      play: jest.fn(),
      pause: jest.fn(),
      addListener: jest.fn((event: string, listener: (payload: { status: string }) => void) => {
        listeners[event] = listener;
        return { remove: jest.fn() };
      }),
    });
    renderBubble(message([attachment({ kind: 'video', mimeType: 'video/mp4' })]));
    expect(screen.getByTestId('media-video')).toBeTruthy();

    act(() => {
      listeners.statusChange({ status: 'error' });
    });
    expect(screen.queryByTestId('media-video')).toBeNull();
    expect(screen.getByText("Couldn't load")).toBeTruthy();
  });

  it('asks at the tap for a voice note that never loaded and whose url has expired', () => {
    jest.useFakeTimers().setSystemTime(EXPIRY + 60_000);
    const player = mockAudio({ isLoaded: false, duration: 0 });
    const onUrlExpired = jest.fn();
    renderBubble(message([attachment({ kind: 'audio', mimeType: 'video/mp4' })]), {
      onUrlExpired,
    });

    fireEvent.press(screen.getByLabelText(CARD_COPY.media.spoken.playVoiceNote));
    expect(onUrlExpired).toHaveBeenCalledWith('a1');
    expect(player.play).not.toHaveBeenCalled();
  });

  it('tries a story as a video when it will not load as a photo', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const storyUrl = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1';
    renderBubble(
      message([
        attachment({
          kind: 'story_mention',
          status: 'link_only',
          url: storyUrl,
          urlExpiresAt: new Date(SENT_AT + 24 * 60 * 60_000).toISOString(),
          mimeType: null,
        }),
      ]),
    );
    failImage();
    expect(screen.getByTestId('media-video')).toBeTruthy();
    expect(mockUseVideoPlayer).toHaveBeenCalledWith(storyUrl);
    expect(screen.queryByText("Couldn't load")).toBeNull();
  });
});

/**
 * On a queue card nothing may be pressable and no player may be mounted: a
 * `Pressable` inside the deck's `GestureDetector` kills the swipe (CLAUDE.md,
 * TAC-37). `interactive={false}` is how the cards ask for that.
 */
describe('MediaBubble — on a card (interactive={false})', () => {
  const everything = () =>
    message(
      [
        attachment({ id: 'photo' }),
        attachment({ id: 'gif', kind: 'gif', url: 'https://media3.giphy.com/media/abc/200.gif' }),
        attachment({ id: 'video', kind: 'video', mimeType: 'video/mp4' }),
        attachment({ id: 'voice', kind: 'audio', mimeType: 'video/mp4' }),
        attachment({
          id: 'share',
          kind: 'share',
          status: 'link_only',
          url: null,
          title: 'a reel',
          linkUrl: 'https://www.instagram.com/reel/DcPVXR9vbun/',
        }),
        attachment({
          id: 'story',
          kind: 'story_mention',
          status: 'link_only',
          url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1',
          urlExpiresAt: new Date(SENT_AT + 24 * 60 * 60_000).toISOString(),
          mimeType: null,
        }),
      ],
      { unsupported: true },
    );

  // Counted by role rather than by component type. `UNSAFE_queryAllByType(
  // Pressable)` finds nothing in EITHER mode under this project's NativeWind
  // JSX runtime, so a test written that way passes on a card full of buttons.
  // The control at the bottom of this block is what caught it.
  const pressables = () => [
    ...screen.queryAllByRole('button'),
    ...screen.queryAllByRole('imagebutton'),
    ...screen.queryAllByRole('link'),
    ...screen.queryAllByRole('adjustable'),
  ];

  it('renders nothing pressable at all, whatever the message carries', () => {
    renderBubble(everything(), { interactive: false, compact: true });
    expect(pressables()).toHaveLength(0);
  });

  it('mounts no player', () => {
    renderBubble(everything(), { interactive: false, compact: true });
    expect(mockUseAudioPlayer).not.toHaveBeenCalled();
    expect(mockUseVideoPlayer).not.toHaveBeenCalled();
    expect(screen.queryByTestId('media-video')).toBeNull();
    expect(screen.queryByTestId('voice-note-scrubber')).toBeNull();
  });

  it('still shows the photo and the GIF, and names what it cannot play', () => {
    renderBubble(everything(), { interactive: false, compact: true });
    // The photo and the live story.
    expect(screen.getAllByTestId('media-image')).toHaveLength(2);
    expect(screen.getByTestId('media-gif')).toBeTruthy();
    expect(screen.getByText('Voice note')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText('OPEN IN INSTAGRAM')).toBeTruthy();
  });

  it('is the control: the same message in a thread IS pressable', () => {
    // Without this the two tests above would pass on a component that
    // rendered nothing.
    renderBubble(everything());
    // Two photos (the image and the story), the share's link, and the voice
    // note's button and scrubber.
    expect(screen.queryAllByRole('imagebutton')).toHaveLength(2);
    expect(screen.queryAllByRole('link')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(1);
    expect(screen.queryAllByRole('adjustable')).toHaveLength(1);
    expect(mockUseAudioPlayer).toHaveBeenCalled();
    expect(mockUseVideoPlayer).toHaveBeenCalled();
  });
});

/**
 * "Reshare on Instagram" under a story the guest tagged the venue in.
 * (TAC-585.) The link's presence is decided by `isLiveStoryMention`, tested on
 * its own; this is what the bubble does with the answer.
 */
describe('MediaBubble: reshare a story mention', () => {
  const storyUrl = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1';
  const liveMention = (overrides: Partial<Attachment> = {}) =>
    attachment({
      id: 'story',
      kind: 'story_mention',
      status: 'link_only',
      url: storyUrl,
      urlExpiresAt: new Date(SENT_AT + 24 * 60 * 60_000).toISOString(),
      mimeType: null,
      ...overrides,
    });
  const reshareLink = () => screen.queryByRole('link', { name: 'Reshare on Instagram' });

  it('offers it under a live story mention, and a press runs the action', () => {
    const onReshare = jest.fn();
    renderBubble(message([liveMention()]), { onReshare });
    expect(screen.getByText('RESHARE ON INSTAGRAM')).toBeTruthy();
    fireEvent.press(reshareLink()!);
    expect(onReshare).toHaveBeenCalledTimes(1);
  });

  it('keeps the story itself on screen beside it', () => {
    renderBubble(message([liveMention()]), { onReshare: jest.fn() });
    expect(screen.getByTestId('media-image').props.source).toEqual({ uri: storyUrl });
  });

  it('offers nothing once the story has expired', () => {
    renderBubble(
      message([liveMention({ status: 'expired', url: null, urlExpiresAt: null })]),
      { onReshare: jest.fn() },
    );
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(reshareLink()).toBeNull();
  });

  it('offers nothing once the 24 hours have passed on this device', () => {
    renderBubble(message([liveMention()]), {
      onReshare: jest.fn(),
      nowMs: SENT_AT + 24 * 60 * 60_000,
    });
    expect(reshareLink()).toBeNull();
  });

  it('offers nothing on a story reply, a photo or a reel share', () => {
    renderBubble(
      message([
        liveMention({ id: 'reply', kind: 'story_reply' }),
        attachment({ id: 'photo' }),
        attachment({
          id: 'reel',
          kind: 'share',
          status: 'link_only',
          url: null,
          urlExpiresAt: null,
          linkUrl: 'https://www.instagram.com/reel/DcPVXR9vbun/',
        }),
      ]),
      { onReshare: jest.fn() },
    );
    expect(reshareLink()).toBeNull();
  });

  it('offers nothing where the screen passes no action', () => {
    renderBubble(message([liveMention()]));
    expect(reshareLink()).toBeNull();
  });

  it('draws nothing pressable on a card, even when handed the action', () => {
    // A card sits inside the deck's GestureDetector. Its link is drawn by the
    // stack, outside the detector, never by the bubble.
    renderBubble(message([liveMention()]), {
      onReshare: jest.fn(),
      interactive: false,
      compact: true,
    });
    expect(reshareLink()).toBeNull();
    expect(screen.queryByTestId('reshare-link')).toBeNull();
  });

  it('still offers it when the story would not draw', () => {
    // Meta's link failing to load says nothing about whether Instagram still
    // offers the reshare.
    renderBubble(message([liveMention()]), { onReshare: jest.fn(), interactive: true });
    act(() => {
      screen.getByTestId('media-image').props.onError();
    });
    // Tried as a video next; that failing too leaves "Couldn't load".
    expect(reshareLink()).not.toBeNull();
  });
});
