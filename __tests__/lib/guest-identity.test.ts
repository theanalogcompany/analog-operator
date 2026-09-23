import { CARD_COPY } from '@/lib/card-copy';
import { formatHandle, guestFirstName, guestIdentity } from '@/lib/guest-identity';

const instagram = (over: Partial<Parameters<typeof guestIdentity>[0]> = {}) =>
  guestIdentity({
    displayName: 'Mia B.',
    instagramUsername: 'mia.brews',
    phoneFallback: '',
    channel: 'instagram',
    ...over,
  });

const text = (over: Partial<Parameters<typeof guestIdentity>[0]> = {}) =>
  guestIdentity({
    displayName: 'Nadia S.',
    instagramUsername: null,
    phoneFallback: '+15551110004',
    channel: 'text',
    ...over,
  });

describe('an Instagram guest', () => {
  it('shows the name, with the handle on its own line', () => {
    const id = instagram();
    expect(id.name).toBe('Mia B.');
    expect(id.nameIsSubstitute).toBe(false);
    expect(id.handle).toBe('@mia.brews');
    expect(id.initial).toBe('M');
  });

  it('shows the handle as the name when there is none', () => {
    const id = instagram({ displayName: null });
    expect(id.name).toBe('@mia.brews');
    expect(id.nameIsSubstitute).toBe(true);
  });

  it('takes the avatar initial from the handle, skipping the @', () => {
    // An avatar reading "@" identifies nobody.
    const id = instagram({ displayName: null, instagramUsername: 'lena.eats' });
    expect(id.name).toBe('@lena.eats');
    expect(id.initial).toBe('L');
  });

  it('NEVER shows a phone number, even when the guest has one', () => {
    // Hand-off B2: "The phone number never appears on an Instagram card."
    const id = instagram({ phoneFallback: '+15551110004' });
    expect(id.phone).toBeNull();
  });

  it('never shows a phone even when it is the only identifier left', () => {
    const id = instagram({
      displayName: null,
      instagramUsername: null,
      phoneFallback: '+15551110004',
    });
    expect(id.phone).toBeNull();
    expect(id.name).toBe(CARD_COPY.guestFallback.instagram);
  });

  /**
   * The live defect this module exists for. TAC-473 ruled `phoneFallback` stays
   * a non-nullable string that is `''` for a phoneless guest, and `??` does not
   * fall back on `''`, so the old `name ?? phoneFallback` chain rendered a BLANK
   * name for exactly this guest: the unnamed Instagram one.
   */
  it('never renders blank, which is the bug it was written to fix', () => {
    const id = instagram({
      displayName: null,
      instagramUsername: null,
      phoneFallback: '',
    });
    expect(id.name).not.toBe('');
    expect(id.name).toBe('Instagram guest');
    expect(id.initial).toBe('I');
  });

  it('treats a whitespace-only name as no name at all', () => {
    const id = instagram({ displayName: '   ' });
    expect(id.name).toBe('@mia.brews');
    expect(id.nameIsSubstitute).toBe(true);
  });
});

describe('a text guest', () => {
  it('shows the name and keeps the phone, exactly as it ships today', () => {
    const id = text();
    expect(id.name).toBe('Nadia S.');
    expect(id.phone).toBe('+15551110004');
    expect(id.handle).toBeNull();
  });

  it('falls back to the phone when there is no name', () => {
    const id = text({ displayName: null });
    expect(id.name).toBe('+15551110004');
    expect(id.nameIsSubstitute).toBe(true);
  });

  it('never renders blank when there is no name and no phone either', () => {
    const id = text({ displayName: null, phoneFallback: '' });
    expect(id.name).toBe(CARD_COPY.guestFallback.text);
  });

  /**
   * A guest who holds both identifiers but is on the text channel gets a
   * message at their PHONE, so the card must not name their Instagram handle:
   * a card's identity has to agree with what approving it will do. This is the
   * same principle that makes `guestChannel` the draft row's own channel in
   * TAC-473's Contract, and it is what keeps the hand-off's binding constraint
   * ("text cards don't change, phone number included") true.
   */
  it('shows no handle on a text card even when the guest has one', () => {
    const id = text({ instagramUsername: 'nadia.s' });
    expect(id.handle).toBeNull();
    expect(id.phone).toBe('+15551110004');
  });

  it('does not use the handle as a name substitute on a text card', () => {
    const id = text({ displayName: null, instagramUsername: 'nadia.s' });
    expect(id.name).toBe('+15551110004');
  });
});

describe('formatHandle', () => {
  it('prepends the @ the wire never carries', () => {
    expect(formatHandle('hana.brews')).toBe('@hana.brews');
  });
});

describe('guestFirstName', () => {
  it('takes the first word of a real name', () => {
    expect(guestFirstName(instagram({ displayName: 'Mia B.' }))).toBe('Mia');
    expect(guestFirstName(text({ displayName: 'Nadia S.' }))).toBe('Nadia');
  });

  it('keeps a handle whole rather than cutting it at the dot', () => {
    const id = instagram({ displayName: null, instagramUsername: 'lena.eats' });
    expect(guestFirstName(id)).toBe('@lena.eats');
  });

  it('keeps a phone whole', () => {
    expect(guestFirstName(text({ displayName: null }))).toBe('+15551110004');
  });
});
