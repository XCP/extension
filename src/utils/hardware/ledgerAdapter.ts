/**
 * Ledger Hardware Wallet Adapter (Stub)
 *
 * Ledger support is planned for a future release.
 * For now, only Trezor hardware wallets are supported.
 */

import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { IHardwareWalletAdapter } from './interface';
import {
  HardwareDeviceInfo,
  HardwareAddress,
  HardwareSignRequest,
  HardwareSignResult,
  HardwareMessageSignRequest,
  HardwareMessageSignResult,
  HardwareConnectionStatus,
  HardwareWalletError,
  HardwarePsbtSignRequest,
} from './types';

/**
 * Ledger Hardware Wallet Adapter (Stub)
 *
 * All methods throw "not supported" errors.
 * Ledger support will be added in a future release.
 */
export class LedgerAdapter implements IHardwareWalletAdapter {
  private throwNotSupported(): never {
    throw new HardwareWalletError(
      'Ledger support is not yet available. Please use a Trezor device.',
      'NOT_SUPPORTED',
      'ledger',
      'Ledger hardware wallets are not yet supported. Trezor support is available.'
    );
  }

  async init(): Promise<void> {
    this.throwNotSupported();
  }

  isInitialized(): boolean {
    return false;
  }

  getConnectionStatus(): HardwareConnectionStatus {
    return 'disconnected';
  }

  async getDeviceInfo(): Promise<HardwareDeviceInfo | null> {
    this.throwNotSupported();
  }

  async getAddress(
    _addressFormat: AddressFormat,
    _account?: number,
    _index?: number,
    _showOnDevice?: boolean,
    _usePassphrase?: boolean
  ): Promise<HardwareAddress> {
    this.throwNotSupported();
  }

  async getAddresses(
    _addressFormat: AddressFormat,
    _account: number,
    _startIndex: number,
    _count: number,
    _usePassphrase?: boolean
  ): Promise<HardwareAddress[]> {
    this.throwNotSupported();
  }

  async getXpub(
    _addressFormat: AddressFormat,
    _account?: number,
    _usePassphrase?: boolean
  ): Promise<string> {
    this.throwNotSupported();
  }

  async signTransaction(_request: HardwareSignRequest): Promise<HardwareSignResult> {
    this.throwNotSupported();
  }

  async signMessage(_request: HardwareMessageSignRequest): Promise<HardwareMessageSignResult> {
    this.throwNotSupported();
  }

  async signPsbt(_request: HardwarePsbtSignRequest): Promise<{ signedPsbtHex: string }> {
    this.throwNotSupported();
  }

  async dispose(): Promise<void> {
    // Nothing to dispose
  }
}

// Singleton instance
let ledgerAdapterInstance: LedgerAdapter | null = null;

/**
 * Get the Ledger adapter singleton instance
 */
export function getLedgerAdapter(): LedgerAdapter {
  if (!ledgerAdapterInstance) {
    ledgerAdapterInstance = new LedgerAdapter();
  }
  return ledgerAdapterInstance;
}

/**
 * Reset the Ledger adapter (for testing or cleanup)
 */
export async function resetLedgerAdapter(): Promise<void> {
  if (ledgerAdapterInstance) {
    await ledgerAdapterInstance.dispose();
    ledgerAdapterInstance = null;
  }
}
