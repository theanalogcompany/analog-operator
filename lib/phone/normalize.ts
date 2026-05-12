import { parsePhoneNumberWithError } from 'libphonenumber-js';

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; error: 'invalid' };

export function normalizeUsPhone(input: string): PhoneResult {
  if (!input.trim()) {
    return { ok: false, error: 'invalid' };
  }
  try {
    const parsed = parsePhoneNumberWithError(input, 'US');
    if (!parsed.isValid()) {
      return { ok: false, error: 'invalid' };
    }
    return { ok: true, e164: parsed.number };
  } catch {
    return { ok: false, error: 'invalid' };
  }
}
