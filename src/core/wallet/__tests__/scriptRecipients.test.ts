import { describe, expect, it } from 'vitest';
import {
  knownScriptRecipients,
  MAX_SCRIPT_RECIPIENTS,
  sanitizeScriptRecipientPairs,
  withScriptRecipients,
} from '../scriptRecipients';

const PAYER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const OTHER_PAYER = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
const P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';

describe('script payment recipients', () => {
  it('starts empty', () => {
    expect(knownScriptRecipients([], PAYER)).toEqual([]);
  });

  it('keeps recipients per paying address, without duplicates', () => {
    const once = withScriptRecipients([], PAYER, [P2TR, P2TR])!;
    expect(withScriptRecipients(once, PAYER, [P2TR.toUpperCase()])).toBeNull();
    expect(knownScriptRecipients(once, PAYER)).toEqual([P2TR]);
    expect(knownScriptRecipients(once, OTHER_PAYER)).toEqual([]);
  });

  it('reports nothing to write when every recipient is already known', () => {
    const pairs = withScriptRecipients([], PAYER, [P2TR])!;
    expect(withScriptRecipients(pairs, PAYER, [P2TR])).toBeNull();
    expect(withScriptRecipients(pairs, PAYER, [])).toBeNull();
    expect(knownScriptRecipients(withScriptRecipients(pairs, PAYER, [P2TR, P2SH])!, PAYER)).toEqual([P2TR, P2SH]);
  });

  it('keeps only the most recent entries', () => {
    let pairs: string[] = [];
    const recipients = Array.from({ length: MAX_SCRIPT_RECIPIENTS + 5 }, (_, index) => `3Recipient${index}`);
    for (const recipient of recipients) pairs = withScriptRecipients(pairs, PAYER, [recipient]) ?? pairs;
    const known = knownScriptRecipients(pairs, PAYER);
    expect(known).toHaveLength(MAX_SCRIPT_RECIPIENTS);
    expect(known[0]).toBe('3Recipient5');
    expect(known.at(-1)).toBe(recipients.at(-1));
  });

  it('keeps well-formed stored entries and drops the rest', () => {
    expect(sanitizeScriptRecipientPairs('not a list')).toEqual([]);
    expect(sanitizeScriptRecipientPairs([`${PAYER} ${P2TR}`, 7, null])).toEqual([`${PAYER} ${P2TR}`]);
    expect(sanitizeScriptRecipientPairs(Array.from({ length: MAX_SCRIPT_RECIPIENTS + 1 }, (_, i) => `${i}`)))
      .toHaveLength(MAX_SCRIPT_RECIPIENTS);
  });
});
