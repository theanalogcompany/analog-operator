import { type HeadsUpCommitment } from '@/lib/api/queue';
import {
  arrivalLabel,
  commitmentAgeMs,
  commitmentTypeLabel,
  headsUpGuestName,
  headsUpStripLabel,
  showsCodeChip,
} from '@/lib/heads-up';

const TZ = 'America/Los_Angeles';
// Monday 2026-09-14, 08:00 in Los Angeles (PDT is UTC-7).
const NOW = new Date('2026-09-14T15:00:00.000Z');

function makeCommitment(overrides: Partial<HeadsUpCommitment> = {}): HeadsUpCommitment {
  return {
    id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    guestId: 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    type: 'comp',
    guest: { name: 'Sam' },
    description: 'A cortado on the house',
    code: '7K2P',
    expected_arrival: null,
    created_at: '2026-09-14T13:00:00.000Z',
    recognitionState: 'regular',
    sourceMessageId: null,
    ...overrides,
  };
}

describe('showsCodeChip', () => {
  it.each(['comp', 'hold', 'discount'])('shows the code on a %s', (type) => {
    expect(showsCodeChip(makeCommitment({ type, code: '7K2P' }))).toBe(true);
  });

  it('never shows one on a recommendation, even if a code arrived', () => {
    expect(showsCodeChip(makeCommitment({ type: 'recommendation', code: '7K2P' }))).toBe(false);
  });

  it.each([null, '', '   '])('shows nothing when the code is %j', (code) => {
    expect(showsCodeChip(makeCommitment({ code }))).toBe(false);
  });

  it('shows nothing for a type it does not know', () => {
    expect(showsCodeChip(makeCommitment({ type: 'voucher', code: '7K2P' }))).toBe(false);
  });
});

describe('commitmentTypeLabel', () => {
  it.each([
    ['comp', 'Comp'],
    ['hold', 'Hold'],
    ['discount', 'Discount'],
    ['recommendation', 'Recommendation'],
  ])('labels %s as %s', (type, label) => {
    expect(commitmentTypeLabel(type)).toBe(label);
  });

  it('renders an unknown type under a neutral label rather than dropping it', () => {
    expect(commitmentTypeLabel('voucher')).toBe('Commitment');
    expect(commitmentTypeLabel('')).toBe('Commitment');
  });
});

describe('headsUpGuestName', () => {
  it('uses the first name the server sends', () => {
    expect(headsUpGuestName(makeCommitment())).toBe('Sam');
  });

  it.each(['', '   '])('falls back to "Guest" when the name is %j', (name) => {
    expect(headsUpGuestName(makeCommitment({ guest: { name } }))).toBe('Guest');
  });
});

describe('arrivalLabel', () => {
  it('reads "Now" when the guest gave no time', () => {
    expect(arrivalLabel(null, NOW, TZ)).toBe('Now');
  });

  it('reads "Now" once the expected time has come', () => {
    expect(arrivalLabel('2026-09-14T14:00:00.000Z', NOW, TZ)).toBe('Now');
    expect(arrivalLabel(NOW.toISOString(), NOW, TZ)).toBe('Now');
  });

  it('reads "Now" rather than a garbage time when the timestamp is unreadable', () => {
    expect(arrivalLabel('tomorrow-ish', NOW, TZ)).toBe('Now');
  });

  it('gives the clock time for later today', () => {
    expect(arrivalLabel('2026-09-14T15:30:00.000Z', NOW, TZ)).toBe('8:30 AM');
  });

  it('judges "today" in the given timezone, not in UTC', () => {
    // 06:30Z on the 15th is still 23:30 on the 14th in Los Angeles.
    expect(arrivalLabel('2026-09-15T06:30:00.000Z', NOW, TZ)).toBe('11:30 PM');
  });

  it('adds the weekday when it is not today', () => {
    expect(arrivalLabel('2026-09-15T16:00:00.000Z', NOW, TZ)).toBe('Tue 9:00 AM');
  });

  it('separates the time from AM/PM with a plain space', () => {
    // Intl emits a narrow no-break space there; on a tracked-caps label it
    // renders as a visibly different gap from every other space on the card.
    expect(arrivalLabel('2026-09-14T15:30:00.000Z', NOW, TZ)).not.toMatch(/[\u00a0\u202f]/);
  });
});

describe('headsUpStripLabel', () => {
  it('says the commitment is due now for an imminent arrival', () => {
    expect(headsUpStripLabel(makeCommitment(), NOW, TZ)).toBe('Commitment · Due now');
  });

  it('names the time for a later arrival', () => {
    expect(
      headsUpStripLabel(makeCommitment({ expected_arrival: '2026-09-14T15:30:00.000Z' }), NOW, TZ),
    ).toBe('Commitment · Due 8:30 AM');
  });
});

describe('commitmentAgeMs', () => {
  it('measures from when the promise was made', () => {
    expect(commitmentAgeMs(makeCommitment(), NOW)).toBe(2 * 60 * 60_000);
  });

  it('reads an unknown or future creation time as just now, never negative', () => {
    expect(commitmentAgeMs(makeCommitment({ created_at: null }), NOW)).toBe(0);
    expect(commitmentAgeMs(makeCommitment({ created_at: '2026-09-14T16:00:00.000Z' }), NOW)).toBe(0);
  });
});

describe('heads-up card copy', () => {
  it('carries no em dash in anything this module builds (TAC-364)', () => {
    const copy = [
      headsUpStripLabel(makeCommitment(), NOW, TZ),
      headsUpStripLabel(makeCommitment({ expected_arrival: '2026-09-15T16:00:00.000Z' }), NOW, TZ),
      arrivalLabel('2026-09-15T16:00:00.000Z', NOW, TZ),
      ...['comp', 'hold', 'discount', 'recommendation', 'voucher'].map(commitmentTypeLabel),
      headsUpGuestName(makeCommitment({ guest: { name: '' } })),
    ];
    for (const text of copy) {
      expect(text).not.toMatch(/—/);
    }
  });
});
