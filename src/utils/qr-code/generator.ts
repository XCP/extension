/**
 * Bitcoin QR Code Generator
 *
 * This module provides a simple interface for generating QR codes for Bitcoin addresses.
 * It uses Nayuki's QR Code generator (MIT licensed) for reliable QR code generation.
 */

import { qrcodegen } from '@/utils/qr-code/qrcodegen';

/**
 * Generate QR code matrix for Bitcoin address
 * @param address Bitcoin address to encode
 * @returns 2D boolean array representing the QR code (true = black, false = white)
 */
export function generateBitcoinQR(address: string): boolean[][] {
  // Validate it looks like a Bitcoin address
  if (!address || address.length < 26 || address.length > 90) {
    throw new Error('Invalid Bitcoin address length');
  }

  // Create QR code using Nayuki's implementation
  // Use Medium error correction level for good balance of resilience and data capacity
  const qr = qrcodegen.QrCode.encodeText(address, qrcodegen.QrCode.Ecc.MEDIUM);

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

/**
 * Generate QR code with Bitcoin URI (includes amount, label, etc.)
 * @param address Bitcoin address
 * @param amount Optional amount in BTC
 * @param label Optional label
 * @param message Optional message
 * @returns 2D boolean array representing the QR code
 */
export function generateBitcoinURIQR(
  address: string,
  amount?: number,
  label?: string,
  message?: string
): boolean[][] {
  // Build Bitcoin URI according to BIP21
  let uri = `bitcoin:${address}`;
  const params: string[] = [];

  if (amount !== undefined && amount > 0) {
    params.push(`amount=${amount}`);
  }
  if (label) {
    params.push(`label=${encodeURIComponent(label)}`);
  }
  if (message) {
    params.push(`message=${encodeURIComponent(message)}`);
  }

  if (params.length > 0) {
    uri += '?' + params.join('&');
  }

  // Generate QR code
  const qr = qrcodegen.QrCode.encodeText(uri, qrcodegen.QrCode.Ecc.MEDIUM);

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