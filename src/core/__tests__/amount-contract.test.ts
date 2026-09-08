import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type DecimalPlaces, parseAmountDraft, parseRawInteger, rawToInput } from '@/core/amount-contract/amounts';
import vectors from '@/core/amount-contract/amounts-v1.json';
import provenance from '@/core/amount-contract/provenance.json';

describe('shared wallet-sdk amount contract', () => {
  it('keeps the vendored module and vectors byte-identical to the pinned upstream commit', () => {
    expect(provenance.commit).toBe('6296162d6cb1bb3b17d48e9879f4f106baef9212');
    for (const [file, sha256] of Object.entries(provenance.files)) {
      const bytes = readFileSync(resolve(process.cwd(), `src/core/amount-contract/${file}`));
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(sha256);
    }
  });
  for (const vector of vectors.drafts) it(vector.id, () => {
    const parsed = parseAmountDraft(vector.draft, { decimals: vector.decimals as DecimalPlaces });
    expect(parsed.status).toBe(vector.status);
    expect(parsed.draft).toBe(vector.draft);
    if (parsed.status === 'valid') {
      expect(parsed.raw.toString()).toBe(vector.raw);
      expect(parsed.canonical).toBe(vector.canonical);
    } else if (parsed.status === 'invalid') expect(parsed.code).toBe(vector.code);
  });
  for (const vector of vectors.rawToInput) it(`generated input ${vector.raw}/${vector.decimals}`, () => {
    expect(rawToInput(vector.raw, vector.decimals as DecimalPlaces)).toBe(vector.input);
  });
  for (const vector of vectors.rawIntegers) it(`raw integer ${vector.input}`, () => {
    if (vector.valid) expect(parseRawInteger(vector.input).toString()).toBe(vector.raw);
    else expect(() => parseRawInteger(vector.input)).toThrow();
  });
});
