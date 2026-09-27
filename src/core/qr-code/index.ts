/**
 * QR Code Generation Module
 *
 * Provides QR code matrix generation.
 * Uses Nayuki's QR Code generator (MIT licensed) internally.
 */

// Export all public functions from generator
export * from '@/core/qr-code/generator';

// Re-export qrcodegen namespace for advanced usage if needed
export { qrcodegen } from '@/core/qr-code/qrcodegen';

