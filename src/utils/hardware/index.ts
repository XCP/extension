/**
 * Hardware Wallet Module
 *
 * Provides hardware wallet integration for XCP Wallet.
 * Currently supports Trezor devices.
 * Designed to be extensible for future Ledger support.
 */

export * from '@/utils/hardware/types';
export * from '@/utils/hardware/interface';
export { TrezorAdapter, getTrezorAdapter, resetTrezorAdapter } from '@/utils/hardware/trezorAdapter';
