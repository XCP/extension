/**
 * Hardware Wallet Module
 *
 * Provides hardware wallet integration for XCP Wallet.
 * Currently supports Trezor devices.
 */

export * from './types';
export * from './interface';
export { TrezorAdapter, getTrezorAdapter, resetTrezorAdapter } from './trezorAdapter';
