/**
 * QR Code Generation Module
 *
 * Provides utilities for generating QR codes for Bitcoin addresses and URIs.
 * Uses Nayuki's QR Code generator (MIT licensed) internally.
 */

// Export all public functions from generator
export {
  generateBitcoinQR,
  generateBitcoinURIQR,
  generateQR
} from '@/utils/qr-code/generator';

// Re-export qrcodegen namespace for advanced usage if needed
export { qrcodegen } from '@/utils/qr-code/qrcodegen';

// Type exports
export type QRMatrix = boolean[][];