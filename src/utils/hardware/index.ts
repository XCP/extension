/**
 * Hardware Wallet Module
 *
 * Provides hardware wallet integration for XCP Wallet.
 * Currently supports Trezor devices.
 * Designed to be extensible for future Ledger support.
 */

export * from './types';
export * from './interface';
export { TrezorAdapter, getTrezorAdapter, resetTrezorAdapter } from './trezorAdapter';
