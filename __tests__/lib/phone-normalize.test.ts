import { normalizeUsPhone } from '@/lib/phone/normalize';

describe('normalizeUsPhone', () => {
  it('formats a 10-digit US number to E.164', () => {
    const result = normalizeUsPhone('213-373-4253');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+12133734253');
  });

  it('accepts already-E.164 numbers', () => {
    const result = normalizeUsPhone('+12133734253');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+12133734253');
  });

  it('accepts parens / spaces / dots formatting', () => {
    const result = normalizeUsPhone('(213) 373.4253');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+12133734253');
  });

  it('rejects empty input', () => {
    expect(normalizeUsPhone('').ok).toBe(false);
    expect(normalizeUsPhone('   ').ok).toBe(false);
  });

  it('rejects gibberish', () => {
    expect(normalizeUsPhone('abc').ok).toBe(false);
  });

  it('rejects too-short numbers', () => {
    expect(normalizeUsPhone('123').ok).toBe(false);
  });
});
