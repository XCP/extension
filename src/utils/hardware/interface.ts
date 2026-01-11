/**
 * Hardware Wallet Interface
 *
 * Base interface that all hardware wallet adapters must implement.
 * This ensures consistent API across different hardware wallet vendors.
 */

import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import {
  HardwareDeviceInfo,
  HardwareAddress,
  HardwareSignRequest,
  HardwareSignResult,
  HardwareMessageSignRequest,
  HardwareMessageSignResult,
  HardwareConnectionStatus,
  HardwarePsbtSignRequest,
} from './types';

/**
 * Interface for hardware wallet adapters
 */
export interface IHardwareWalletAdapter {
  /**
   * Initialize the hardware wallet connection library.
   * Must be called before any other operations.
   */
  init(): Promise<void>;

  /**
   * Check if the adapter has been initialized
   */
  isInitialized(): boolean;

  /**
   * Get current connection status
   */
  getConnectionStatus(): HardwareConnectionStatus;

  /**
   * Get information about the connected device
   */
  getDeviceInfo(): Promise<HardwareDeviceInfo | null>;

  /**
   * Get a single address from the hardware wallet
   * @param addressFormat - The address format to use
   * @param account - Account index (default 0)
   * @param index - Address index (default 0)
   * @param showOnDevice - Whether to display the address on device for verification
   * @param usePassphrase - Whether to prompt for passphrase entry on device (hidden wallet)
   */
  getAddress(
    addressFormat: AddressFormat,
    account?: number,
    index?: number,
    showOnDevice?: boolean,
    usePassphrase?: boolean
  ): Promise<HardwareAddress>;

  /**
   * Get multiple addresses from the hardware wallet
   * @param addressFormat - The address format to use
   * @param account - Account index
   * @param startIndex - Starting address index
   * @param count - Number of addresses to retrieve
   * @param usePassphrase - Whether to prompt for passphrase entry on device (hidden wallet)
   */
  getAddresses(
    addressFormat: AddressFormat,
    account: number,
    startIndex: number,
    count: number,
    usePassphrase?: boolean
  ): Promise<HardwareAddress[]>;

  /**
   * Get the extended public key (xpub) for an account
   * @param addressFormat - The address format to use
   * @param account - Account index
   * @param usePassphrase - Whether to prompt for passphrase entry on device (hidden wallet)
   */
  getXpub(addressFormat: AddressFormat, account?: number, usePassphrase?: boolean): Promise<string>;

  /**
   * Sign a Bitcoin transaction
   * @param request - Transaction signing request with inputs and outputs
   */
  signTransaction(request: HardwareSignRequest): Promise<HardwareSignResult>;

  /**
   * Sign a message using BIP-322 or legacy Bitcoin message signing
   * @param request - Message signing request
   */
  signMessage(request: HardwareMessageSignRequest): Promise<HardwareMessageSignResult>;

  /**
   * Sign a PSBT (Partially Signed Bitcoin Transaction)
   * Converts PSBT to hardware wallet format, signs, and returns updated PSBT
   * @param request - PSBT signing request with input paths
   */
  signPsbt(request: HardwarePsbtSignRequest): Promise<{ signedPsbtHex: string }>;

  /**
   * Dispose of resources and clean up
   */
  dispose(): Promise<void>;
}

/**
 * Factory function type for creating hardware wallet adapters
 */
export type HardwareAdapterFactory = () => IHardwareWalletAdapter;
