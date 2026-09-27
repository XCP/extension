/**
 * Bitcoin QR Code Generator
 *
 * This module provides a simple interface for generating QR code matrices.
 * It uses Nayuki's QR Code generator (MIT licensed) for reliable QR code generation.
 */

import { qrcodegen } from '@/core/qr-code/qrcodegen';

/**
 * Generate QR code with custom error correction level
 * @param text Text to encode
 * @param errorCorrection Error correction level ('L', 'M', 'Q', 'H')
 * @returns 2D boolean array representing the QR code
 */
export function generateQR(text: string, errorCorrection: 'L' | 'M' | 'Q' | 'H' = 'M'): boolean[][] {
  const eccMap = {
    'L': qrcodegen.QrCode.Ecc.LOW,
    'M': qrcodegen.QrCode.Ecc.MEDIUM,
    'Q': qrcodegen.QrCode.Ecc.QUARTILE,
    'H': qrcodegen.QrCode.Ecc.HIGH,
  };

  const qr = qrcodegen.QrCode.encodeText(text, eccMap[errorCorrection]);

  // Convert to boolean matrix
  const size = qr.size;
  const matrix: boolean[][] = [];

  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      row.push(qr.getModule(x, y));
    }
    matrix.push(row);
  }

  return matrix;
}