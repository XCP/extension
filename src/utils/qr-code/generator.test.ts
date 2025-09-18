import { describe, it, expect } from 'vitest';
import { generateBitcoinQR, generateBitcoinURIQR, generateQR } from '@/utils/qr-code';

describe('Bitcoin QR Code Generator', () => {
  // Test addresses from the codebase
  const TEST_ADDRESSES = {
    P2PKH: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA', // Legacy (34 chars)
    P2SH: '37Lx99uaGn5avKBxiW26HjedQE3LrDCZru', // Nested SegWit (34 chars)
    P2WPKH: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // Native SegWit (42 chars)
    P2TR: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', // Taproot (62 chars)
  };

  describe('generateBitcoinQR', () => {
    it('should generate QR code for P2PKH (Legacy) address', () => {
      const matrix = generateBitcoinQR(TEST_ADDRESSES.P2PKH);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      expect(matrix.length).toBe(matrix[0].length); // Should be square

      // Version 3 (29x29) should be sufficient for 34 chars
      expect(matrix.length).toBeLessThanOrEqual(29);
    });

    it('should generate QR code for P2SH (Nested SegWit) address', () => {
      const matrix = generateBitcoinQR(TEST_ADDRESSES.P2SH);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      expect(matrix.length).toBe(matrix[0].length);

      // Version 3 (29x29) should be sufficient
      expect(matrix.length).toBeLessThanOrEqual(29);
    });

    it('should generate QR code for P2WPKH (Native SegWit) address', () => {
      const matrix = generateBitcoinQR(TEST_ADDRESSES.P2WPKH);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      expect(matrix.length).toBe(matrix[0].length);

      // Version 3 or 4 (33x33) for 42 chars
      expect(matrix.length).toBeLessThanOrEqual(33);
    });

    it('should generate QR code for P2TR (Taproot) address', () => {
      const matrix = generateBitcoinQR(TEST_ADDRESSES.P2TR);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      expect(matrix.length).toBe(matrix[0].length);

      // Version 4 or 5 (37x37) for 62 chars
      expect(matrix.length).toBeLessThanOrEqual(37);
    });

    it('should generate QR code for Bitcoin URI', () => {
      const uri = `bitcoin:${TEST_ADDRESSES.P2WPKH}?amount=0.001&label=Test`;
      const matrix = generateBitcoinQR(uri);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      expect(matrix.length).toBe(matrix[0].length);
    });

    it('should have correct finder patterns', () => {
      const matrix = generateBitcoinQR(TEST_ADDRESSES.P2PKH);
      const size = matrix.length;

      // Check top-left finder pattern center
      expect(matrix[3][3]).toBe(true);

      // Check top-right finder pattern center
      expect(matrix[3][size - 4]).toBe(true);

      // Check bottom-left finder pattern center
      expect(matrix[size - 4][3]).toBe(true);
    });

    it('should have timing patterns', () => {
      const matrix = generateBitcoinQR(TEST_ADDRESSES.P2PKH);

      // Check alternating pattern on row 6
      for (let i = 8; i < matrix.length - 8; i += 2) {
        expect(matrix[6][i]).toBe(true);
        if (i + 1 < matrix.length - 8) {
          expect(matrix[6][i + 1]).toBe(false);
        }
      }
    });

    it('should have dark module', () => {
      const matrix = generateBitcoinQR(TEST_ADDRESSES.P2PKH);
      const size = matrix.length;

      // Dark module is always at (4 * version + 9, 8)
      // For version 3: 4*3+9=21, but need to check based on actual version
      // The dark module should be present somewhere in column 8
      let hasDarkModule = false;
      for (let row = 0; row < size; row++) {
        if (matrix[row][8] === true && row > size - 10) {
          hasDarkModule = true;
          break;
        }
      }
      expect(hasDarkModule).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(() => generateBitcoinQR('')).toThrow('Invalid Bitcoin address length');
      expect(() => generateBitcoinQR('abc')).toThrow('Invalid Bitcoin address length');
      expect(() => generateBitcoinQR('x'.repeat(25))).toThrow('Invalid Bitcoin address length');
      expect(() => generateBitcoinQR('x'.repeat(91))).toThrow('Invalid Bitcoin address length');
    });

    it('should handle maximum length Taproot address', () => {
      // Create a maximum length valid Taproot address pattern
      const longTaproot = 'bc1p' + '0'.repeat(58);
      const matrix = generateBitcoinQR(longTaproot);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      // Should fit in version 5 (37x37) or 6 (41x41)
      expect(matrix.length).toBeLessThanOrEqual(41);
    });
  });

  describe('generateBitcoinURIQR', () => {
    it('should generate QR code for Bitcoin URI with amount', () => {
      const matrix = generateBitcoinURIQR(TEST_ADDRESSES.P2WPKH, 0.001);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      expect(matrix.length).toBe(matrix[0].length);
    });

    it('should generate QR code for Bitcoin URI with all parameters', () => {
      const matrix = generateBitcoinURIQR(
        TEST_ADDRESSES.P2PKH,
        0.5,
        'Test Payment',
        'Invoice #12345'
      );

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(0);
      // URI with all params should need larger QR
      expect(matrix.length).toBeGreaterThan(29);
    });
  });

  describe('QR Code Structure', () => {
    it('should have consistent structure for same input', () => {
      const address = TEST_ADDRESSES.P2WPKH;
      const matrix1 = generateBitcoinQR(address);
      const matrix2 = generateBitcoinQR(address);

      expect(matrix1).toEqual(matrix2);
    });

    it('should produce different patterns for different addresses', () => {
      const matrix1 = generateBitcoinQR(TEST_ADDRESSES.P2PKH);
      const matrix2 = generateBitcoinQR(TEST_ADDRESSES.P2WPKH);

      // Should have different data patterns (check center area)
      let differences = 0;
      const centerStart = 10;
      const centerEnd = Math.min(matrix1.length, matrix2.length) - 10;

      for (let i = centerStart; i < centerEnd; i++) {
        for (let j = centerStart; j < centerEnd; j++) {
          if (matrix1[i] && matrix2[i] && matrix1[i][j] !== matrix2[i][j]) {
            differences++;
          }
        }
      }

      expect(differences).toBeGreaterThan(0);
    });
  });
});