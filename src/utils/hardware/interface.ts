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
   * Sign a PSBT (Partially Signed Bitcoin Transaction) and return a fully signed raw transaction.
   *
   * **IMPORTANT: Return format clarification**
   * Despite accepting a PSBT as input, this method returns a **fully signed raw transaction hex**,
   * NOT a PSBT. This is because hardware wallets like Trezor sign transactions completely
   * in one operation and return the finalized transaction ready for broadcast.
   *
   * The return property is named `signedTxHex` to reflect this. Callers should be aware:
   * - The returned hex is a complete, broadcastable transaction
   * - It is NOT suitable for further PSBT processing or multi-party signing
   * - For standard PSBT workflows requiring incremental signing, use software wallets
   *
   * @param request - PSBT signing request with input paths
   * @returns Object with signedTxHex (fully signed raw transaction, ready for broadcast)
   */
  signPsbt(request: HardwarePsbtSignRequest): Promise<{ signedTxHex: string }>;

  /**
   * Attempt to reconnect after disconnection.
   * Useful for recovering from device disconnect during operation.
   * @returns true if reconnection succeeded, false otherwise
   */
  reconnect(): Promise<boolean>;

  /**
   * Dispose of resources and clean up
   */
  dispose(): Promise<void>;
}

/**
 * Factory function type for creating hardware wallet adapters
 */
export type HardwareAdapterFactory = () => IHardwareWalletAdapter;
