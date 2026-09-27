import { describe, expect, it } from 'vitest';
import { generateQR } from '@/core/qr-code';

describe('generateQR', () => {
  const TEST_ADDRESSES = {
    P2PKH: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA', // Legacy (34 chars)
    P2WPKH: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // Native SegWit (42 chars)
    P2TR: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', // Taproot (62 chars)
  };

  it('returns a square matrix', () => {
    for (const address of Object.values(TEST_ADDRESSES)) {
      const matrix = generateQR(address);
      expect(matrix.length).toBeGreaterThan(0);
      for (const row of matrix) expect(row).toHaveLength(matrix.length);
    }
  });

  it('draws the three finder patterns', () => {
    const matrix = generateQR(TEST_ADDRESSES.P2PKH);
    const size = matrix.length;

    expect(matrix[3]![3]).toBe(true);
    expect(matrix[3]![size - 4]).toBe(true);
    expect(matrix[size - 4]![3]).toBe(true);
  });

  it('draws the timing pattern', () => {
    const matrix = generateQR(TEST_ADDRESSES.P2PKH);

    for (let i = 8; i < matrix.length - 8; i++) {
      expect(matrix[6]![i]).toBe(i % 2 === 0);
    }
  });

  it('needs a larger code for a higher error correction level', () => {
    // 34 bytes fit version 3 (29×29) at M but need version 4 (33×33) at Q.
    expect(generateQR(TEST_ADDRESSES.P2PKH, 'M')).toHaveLength(29);
    expect(generateQR(TEST_ADDRESSES.P2PKH, 'Q')).toHaveLength(33);
  });

  it('is deterministic and depends on the input', () => {
    expect(generateQR(TEST_ADDRESSES.P2WPKH)).toEqual(generateQR(TEST_ADDRESSES.P2WPKH));
    expect(generateQR(TEST_ADDRESSES.P2WPKH)).not.toEqual(generateQR(TEST_ADDRESSES.P2PKH));
  });
});
