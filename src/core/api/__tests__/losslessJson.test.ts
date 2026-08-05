import { describe, expect, it } from 'vitest';
import { parseJsonLossless, quoteUnsafeIntegers } from '@/core/api/losslessJson';

describe('parseJsonLossless', () => {
  it('preserves every digit of an integer past the safe range', () => {
    // The real PEPECASH supply. JSON.parse renders this as 99526925811111100.
    const parsed = parseJsonLossless<{ supply: string }>('{"supply": 99526925811111111}');
    expect(parsed.supply).toBe('99526925811111111');
    expect(JSON.parse('{"supply": 99526925811111111}').supply).toBe(99526925811111100);
  });

  it('leaves safe integers as numbers so nothing already correct changes shape', () => {
    const parsed = parseJsonLossless<{ quantity: number; zero: number; negative: number }>(
      '{"quantity": 1000, "zero": 0, "negative": -42}'
    );
    expect(parsed.quantity).toBe(1000);
    expect(parsed.zero).toBe(0);
    expect(parsed.negative).toBe(-42);
  });

  it('quotes large negative integers too', () => {
    expect(parseJsonLossless<{ v: string }>('{"v": -99526925811111111}').v).toBe('-99526925811111111');
  });

  it('leaves fractions and exponents alone', () => {
    // Quoting these would change their meaning: they were never exact integers.
    const parsed = parseJsonLossless<Record<string, number>>(
      '{"a": 1.5, "b": 1e21, "c": 995269258.11111110, "d": -0.5}'
    );
    expect(parsed.a).toBe(1.5);
    expect(parsed.b).toBe(1e21);
    expect(parsed.c).toBe(995269258.1111111);
    expect(parsed.d).toBe(-0.5);
  });

  it('does not touch digits inside strings', () => {
    // A memo, description or asset name may hold a long number. A regex over the whole document
    // would rewrite it; the scanner must not.
    const parsed = parseJsonLossless<{ memo: string; asset: string }>(
      '{"memo": "paid 99526925811111111 for it", "asset": "A95428957068369060"}'
    );
    expect(parsed.memo).toBe('paid 99526925811111111 for it');
    expect(parsed.asset).toBe('A95428957068369060');
  });

  it('survives escapes and quotes inside strings', () => {
    const parsed = parseJsonLossless<{ text: string; n: string }>(
      '{"text": "he said \\"99526925811111111\\" \\\\", "n": 99526925811111111}'
    );
    expect(parsed.text).toBe('he said "99526925811111111" \\');
    expect(parsed.n).toBe('99526925811111111');
  });

  it('handles nesting, arrays and the shape the unpack endpoint returns', () => {
    const parsed = parseJsonLossless<{ result: { message_data: Array<{ quantity: string }> } }>(
      '{"result": {"message_data": [{"quantity": 9999999999999999}, {"quantity": 1000}]}}'
    );
    expect(parsed.result.message_data[0]!.quantity).toBe('9999999999999999');
    expect(parsed.result.message_data[1]!.quantity).toBe(1000);
  });

  it('throws on malformed input like JSON.parse does', () => {
    expect(() => parseJsonLossless('{"a":')).toThrow();
  });

  it('leaves documents with no oversized integers byte-identical', () => {
    const text = '{"a":1,"b":[2,3],"c":"x","d":null,"e":true,"f":1.25}';
    expect(quoteUnsafeIntegers(text)).toBe(text);
  });
});
