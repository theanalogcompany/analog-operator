import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

import { CARD_COPY } from '@/lib/card-copy';

const EM_DASH = '—';
/** The character itself, its escape, or an HTML entity: all three render one. */
const EM_DASH_IN_SOURCE = /—|\\u2014|&mdash;|&#8212;|&#x2014;/i;

function stringsIn(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      stringsIn(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/**
 * No card-facing string contains an em dash (ruled 2026-09-14, TAC-364). A card
 * is read fast on a phone mid-shift, and an em dash is a pause the reader has
 * to parse. This walks every value in the map rather than naming the strings
 * that used to carry one, so it guards the next string added, not the last
 * ones fixed.
 */
describe('CARD_COPY', () => {
  const strings = stringsIn(CARD_COPY, '');

  // Guards the guard: a walk that silently found nothing would pass every
  // assertion below.
  it('walks every string in the map', () => {
    expect(strings.length).toBeGreaterThanOrEqual(23);
  });

  it.each(strings)('%s carries no em dash', (_path, value) => {
    expect(value).not.toContain(EM_DASH);
  });
});

/**
 * The map only holds strings someone put in it. A string written inline on a
 * card surface bypasses it, so this also scans the surfaces themselves. With
 * comments stripped, any em dash left is in code, and code on these surfaces is
 * copy. It looks for the character, its `\u2014` escape and its HTML entities,
 * since each renders one.
 *
 * Its limits, stated rather than left to be discovered: the comment stripper is
 * a regex, not a parser, so a `//` inside a string ends the scan of that line
 * early; and text the server supplies (the reason sentence, trigger labels,
 * claims) never appears in this repo at all. analog-guest tests its own label
 * map for that.
 */
describe('card surfaces', () => {
  const ROOT = resolve(__dirname, '../..');
  const SURFACES = [
    'components/queue',
    'app/queue',
    // The thread renders on the card and the takeover too.
    'components/thread',
    'components/ui/message-bubble.tsx',
    'lib/thread-cluster.ts',
    'lib/card-copy.ts',
    'lib/heads-up.ts',
    'lib/review-bucket.ts',
    // `recognition.stateLabels` is the recognition badge's text.
    'lib/theme.ts',
  ];

  function sourceFiles(rel: string): string[] {
    const abs = join(ROOT, rel);
    if (statSync(abs).isFile()) return /\.tsx?$/.test(abs) ? [abs] : [];
    return readdirSync(abs).flatMap((entry) => sourceFiles(join(rel, entry)));
  }

  function withoutComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  }

  const files = SURFACES.flatMap(sourceFiles);

  it('finds the card surfaces to scan', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files.map((file) => [relative(ROOT, file), file]))(
    '%s has no em dash outside comments',
    (_rel, file) => {
      const offending = withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .filter((line) => EM_DASH_IN_SOURCE.test(line))
        .map((line) => line.trim());
      expect(offending).toEqual([]);
    },
  );
});
