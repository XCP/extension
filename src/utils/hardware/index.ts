/**
 * Hardware Wallet Module
 *
 * Provides hardware wallet integration for XCP Wallet.
 * Currently supports Trezor devices.
 * Designed to be extensible for future Ledger support.
 */

export * from '@/utils/hardware/interface';
export { getTrezorAdapter, resetTrezorAdapter, TrezorAdapter } from '@/utils/hardware/trezorAdapter';
export * from '@/utils/hardware/types';
