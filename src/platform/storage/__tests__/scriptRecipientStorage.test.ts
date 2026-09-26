import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getKnownScriptRecipients,
  MAX_SCRIPT_RECIPIENTS,
  recordScriptRecipients,
} from '../scriptRecipientStorage';

const PAYER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const OTHER_PAYER = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';

describe('scriptRecipientStorage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('starts empty', async () => {
    expect(await getKnownScriptRecipients(PAYER)).toEqual([]);
  });

  it('keeps recipients per paying address, without duplicates', async () => {
    await recordScriptRecipients(PAYER, [P2TR, P2TR]);
    await recordScriptRecipients(PAYER, [P2TR.toUpperCase()]);
    expect(await getKnownScriptRecipients(PAYER)).toEqual([P2TR]);
    expect(await getKnownScriptRecipients(OTHER_PAYER)).toEqual([]);
  });

  it('keeps only the most recent entries', async () => {
    const recipients = Array.from({ length: MAX_SCRIPT_RECIPIENTS + 5 }, (_, index) => `3Recipient${index}`);
    for (const recipient of recipients) await recordScriptRecipients(PAYER, [recipient]);
    const known = await getKnownScriptRecipients(PAYER);
    expect(known).toHaveLength(MAX_SCRIPT_RECIPIENTS);
    expect(known[0]).toBe('3Recipient5');
    expect(known.at(-1)).toBe(recipients.at(-1));
  });
});
