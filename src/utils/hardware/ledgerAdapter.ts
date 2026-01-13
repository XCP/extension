/**
 * Ledger Hardware Wallet Adapter
 *
 * Implementation of IHardwareWalletAdapter for Ledger devices.
 * Uses the new Ledger Device Management Kit architecture.
 *
 * Supports two modes:
 * - Production mode: Uses WebHID for direct USB communication
 * - Test/Emulator mode: Uses Speculos transport for automated testing
 */

import {
  DeviceManagementKit,
  DeviceManagementKitBuilder,
  type ConnectedDevice,
  type DeviceSessionId,
  DeviceModelId,
} from '@ledgerhq/device-management-kit';
import { webHidTransportFactory } from '@ledgerhq/device-transport-kit-web-hid';
import {
  type SignerBtc,
  SignerBtcBuilder,
  DefaultDescriptorTemplate,
  DefaultWallet,
} from '@ledgerhq/device-signer-kit-bitcoin';
import { firstValueFrom, filter, timeout, catchError } from 'rxjs';

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
  DerivationPaths,
  HardwarePsbtSignRequest,
} from './types';
import {
  abortAllOperations,
  DEFAULT_OPERATION_TIMEOUT_MS,
  LONG_OPERATION_TIMEOUT_MS,
  validateFirmwareForFeature,
} from './operationManager';

/**
 * Configuration options for LedgerAdapter initialization
 */
export interface LedgerAdapterOptions {
  /** Use test/emulator mode (Speculos) */
  testMode?: boolean;
  /** Speculos URL for testing (default: http://localhost:5000) */
  speculosUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Timeout for operations in milliseconds */
  operationTimeout?: number;
}

/**
 * Map our AddressFormat to Ledger's DefaultDescriptorTemplate
 */
const ADDRESS_FORMAT_TO_LEDGER_TEMPLATE: Record<AddressFormat, DefaultDescriptorTemplate> = {
  [AddressFormat.P2PKH]: DefaultDescriptorTemplate.LEGACY,
  [AddressFormat.Counterwallet]: DefaultDescriptorTemplate.LEGACY,
  [AddressFormat.P2SH_P2WPKH]: DefaultDescriptorTemplate.NESTED_SEGWIT,
  [AddressFormat.P2WPKH]: DefaultDescriptorTemplate.NATIVE_SEGWIT,
  [AddressFormat.CounterwalletSegwit]: DefaultDescriptorTemplate.NATIVE_SEGWIT,
  [AddressFormat.P2TR]: DefaultDescriptorTemplate.TAPROOT,
};

/**
 * Default operation timeout (uses operation manager's default)
 */
const DEFAULT_TIMEOUT_MS = DEFAULT_OPERATION_TIMEOUT_MS;

/**
 * Ledger Hardware Wallet Adapter
 */
export class LedgerAdapter implements IHardwareWalletAdapter {
  private initialized = false;
  private connectionStatus: HardwareConnectionStatus = 'disconnected';
  private deviceInfo: HardwareDeviceInfo | null = null;
  private options: LedgerAdapterOptions = {};

  private dmk: DeviceManagementKit | null = null;
  private sessionId: DeviceSessionId | null = null;
  private signer: SignerBtc | null = null;

  /**
   * Initialize Ledger Device Management Kit
   */
  async init(options?: LedgerAdapterOptions): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.options = options ?? {};

    try {
      this.connectionStatus = 'connecting';

      const isTestMode = this.options.testMode === true;

      // Build the Device Management Kit
      const builder = new DeviceManagementKitBuilder();

      if (isTestMode && this.options.speculosUrl) {
        // Test mode with Speculos - we'll need to import speculosTransportFactory
        // For now, we use the mock transport or skip WebHID
        // In practice, Speculos is accessed via HTTP API not as a transport
        if (this.options.debug) {
          console.log('[Ledger] Initializing in test mode with Speculos');
        }
      }

      // Add WebHID transport for browser communication
      builder.addTransport(webHidTransportFactory);

      this.dmk = builder.build();

      this.initialized = true;
      this.connectionStatus = 'disconnected';

      if (this.options.debug) {
        console.log('[Ledger] Device Management Kit initialized');
      }
    } catch (error) {
      this.connectionStatus = 'error';
      throw new HardwareWalletError(
        `Failed to initialize Ledger: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_FAILED',
        'ledger',
        'Failed to initialize Ledger connection. Please try again.'
      );
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): HardwareConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Connect to a Ledger device
   */
  private async connectDevice(): Promise<void> {
    if (!this.dmk) {
      throw new HardwareWalletError(
        'Ledger adapter not initialized',
        'NOT_INITIALIZED',
        'ledger'
      );
    }

    if (this.sessionId) {
      // Already connected
      return;
    }

    try {
      this.connectionStatus = 'connecting';

      // Start device discovery and wait for first connected device
      const discoveryResult$ = this.dmk.startDiscovering({
        transport: 'USB',
      });

      // Wait for the first discovered device with timeout
      const connectedDevice = await firstValueFrom(
        discoveryResult$.pipe(
          filter((result): result is { type: 'discovered'; device: ConnectedDevice } =>
            result.type === 'discovered'
          ),
          timeout(this.options.operationTimeout ?? DEFAULT_TIMEOUT_MS),
          catchError((err) => {
            throw new HardwareWalletError(
              `Device discovery failed: ${err.message ?? 'Timeout'}`,
              'DISCOVERY_FAILED',
              'ledger',
              'Could not find a Ledger device. Make sure it is connected and unlocked.'
            );
          })
        )
      );

      // Stop discovering once we have a device
      this.dmk.stopDiscovering();

      // Connect to the discovered device
      const session = await this.dmk.connect({ device: connectedDevice.device });
      this.sessionId = session.sessionId;

      // Build the Bitcoin signer
      this.signer = new SignerBtcBuilder({ dmk: this.dmk, sessionId: this.sessionId }).build();

      // Update device info
      this.deviceInfo = {
        vendor: 'ledger',
        model: this.getModelName(connectedDevice.device.modelId),
        connected: true,
      };

      this.connectionStatus = 'connected';

      if (this.options.debug) {
        console.log('[Ledger] Connected to device:', this.deviceInfo);
      }
    } catch (error) {
      this.connectionStatus = 'error';
      if (error instanceof HardwareWalletError) {
        throw error;
      }
      throw new HardwareWalletError(
        `Failed to connect to Ledger: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECT_FAILED',
        'ledger',
        'Failed to connect to Ledger device. Please check the connection and try again.'
      );
    }
  }

  /**
   * Get human-readable model name from DeviceModelId
   */
  private getModelName(modelId: DeviceModelId): string {
    switch (modelId) {
      case DeviceModelId.NANO_S:
        return 'Nano S';
      case DeviceModelId.NANO_SP:
        return 'Nano S Plus';
      case DeviceModelId.NANO_X:
        return 'Nano X';
      case DeviceModelId.STAX:
        return 'Stax';
      case DeviceModelId.FLEX:
        return 'Flex';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<HardwareDeviceInfo | null> {
    this.ensureInitialized();

    // Connect if not already connected
    await this.connectDevice();

    return this.deviceInfo;
  }

  /**
   * Create a DefaultWallet for the given address format and account
   */
  private createDefaultWallet(addressFormat: AddressFormat, account: number): DefaultWallet {
    const template = ADDRESS_FORMAT_TO_LEDGER_TEMPLATE[addressFormat];
    const purpose = DerivationPaths.getPurpose(addressFormat);
    // Ledger expects account-level derivation path for wallet
    const derivationPath = `m/${purpose}'/0'/${account}'`;
    return new DefaultWallet(derivationPath, template);
  }

  /**
   * Get a single address from Ledger
   */
  async getAddress(
    addressFormat: AddressFormat,
    account: number = 0,
    index: number = 0,
    showOnDevice: boolean = false,
    usePassphrase: boolean = false
  ): Promise<HardwareAddress> {
    this.ensureInitialized();
    await this.connectDevice();

    if (!this.signer) {
      throw new HardwareWalletError(
        'Bitcoin signer not initialized',
        'SIGNER_NOT_INITIALIZED',
        'ledger'
      );
    }

    // Validate firmware for Taproot
    if (addressFormat === AddressFormat.P2TR) {
      const validation = validateFirmwareForFeature(
        'ledger',
        'taproot',
        this.deviceInfo?.firmwareVersion
      );
      if (!validation.valid) {
        throw new HardwareWalletError(
          validation.message ?? 'Firmware update required for Taproot',
          'FIRMWARE_UPDATE_REQUIRED',
          'ledger',
          validation.message
        );
      }
    }

    // Note: Ledger doesn't support passphrase the same way Trezor does
    // The passphrase would need to be configured on the device itself
    if (usePassphrase) {
      console.warn('[Ledger] Passphrase support must be configured on the device');
    }

    try {
      const pathArray = DerivationPaths.getBip44Path(addressFormat, account, 0, index);
      const pathString = DerivationPaths.pathToString(pathArray);

      // Create a default wallet for the account
      const wallet = this.createDefaultWallet(addressFormat, account);

      // Get the address using the signer
      // The addressIndex is the index within the account (change=0, index=N)
      // Use longer timeout if showing on device (requires user confirmation)
      const timeoutMs = showOnDevice ? LONG_OPERATION_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
      const result = await this.executeSignerAction<{ address: string }>(
        this.signer.getWalletAddress(wallet, index, {
          checkOnDevice: showOnDevice,
          change: false, // We want receiving addresses (change = 0)
        }),
        'getAddress',
        timeoutMs
      );

      return {
        address: result.address,
        publicKey: '', // Ledger doesn't return pubkey with getWalletAddress
        path: pathString,
      };
    } catch (error) {
      if (error instanceof HardwareWalletError) {
        throw error;
      }
      throw new HardwareWalletError(
        `Failed to get address: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ADDRESS_FAILED',
        'ledger',
        'Failed to get address from Ledger. Please check your device and try again.'
      );
    }
  }

  /**
   * Get multiple addresses from Ledger
   */
  async getAddresses(
    addressFormat: AddressFormat,
    account: number,
    startIndex: number,
    count: number,
    usePassphrase: boolean = false
  ): Promise<HardwareAddress[]> {
    this.ensureInitialized();
    await this.connectDevice();

    const addresses: HardwareAddress[] = [];

    // Ledger doesn't have a bundle API, so we get addresses one by one
    for (let i = 0; i < count; i++) {
      const addr = await this.getAddress(
        addressFormat,
        account,
        startIndex + i,
        false, // Don't show on device for batch requests
        usePassphrase
      );
      addresses.push(addr);
    }

    return addresses;
  }

  /**
   * Get extended public key (xpub) for an account
   */
  async getXpub(addressFormat: AddressFormat, account: number = 0, usePassphrase: boolean = false): Promise<string> {
    this.ensureInitialized();
    await this.connectDevice();

    if (!this.signer) {
      throw new HardwareWalletError(
        'Bitcoin signer not initialized',
        'SIGNER_NOT_INITIALIZED',
        'ledger'
      );
    }

    try {
      const purpose = DerivationPaths.getPurpose(addressFormat);
      const path = `m/${purpose}'/0'/${account}'`;

      // Get extended public key
      const result = await this.executeSignerAction<{ extendedPublicKey: string }>(
        this.signer.getExtendedPublicKey(path),
        'getXpub'
      );

      return result.extendedPublicKey;
    } catch (error) {
      if (error instanceof HardwareWalletError) {
        throw error;
      }
      throw new HardwareWalletError(
        `Failed to get xpub: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_XPUB_FAILED',
        'ledger',
        'Failed to get extended public key from Ledger.'
      );
    }
  }

  /**
   * Sign a Bitcoin transaction
   * Note: For Ledger, we prefer using signPsbt as it's the more modern approach
   */
  async signTransaction(_request: HardwareSignRequest): Promise<HardwareSignResult> {
    // Ledger's modern SDK prefers PSBT-based signing
    // Convert the legacy format to PSBT and use signPsbt
    throw new HardwareWalletError(
      'Direct transaction signing not supported. Use signPsbt instead.',
      'USE_PSBT',
      'ledger',
      'Please use PSBT format for transaction signing with Ledger.'
    );
  }

  /**
   * Sign a message
   */
  async signMessage(request: HardwareMessageSignRequest): Promise<HardwareMessageSignResult> {
    this.ensureInitialized();
    await this.connectDevice();

    if (!this.signer) {
      throw new HardwareWalletError(
        'Bitcoin signer not initialized',
        'SIGNER_NOT_INITIALIZED',
        'ledger'
      );
    }

    try {
      const pathString = DerivationPaths.pathToString(request.path);

      // Sign the message (requires user confirmation on device)
      const result = await this.executeSignerAction<{ signature: string }>(
        this.signer.signMessage(pathString, request.message),
        'signMessage',
        LONG_OPERATION_TIMEOUT_MS
      );

      // Get the address for verification
      const purpose = request.path[0] & ~DerivationPaths.HARDENED;
      let addressFormat: AddressFormat;
      switch (purpose) {
        case 44:
          addressFormat = AddressFormat.P2PKH;
          break;
        case 49:
          addressFormat = AddressFormat.P2SH_P2WPKH;
          break;
        case 84:
          addressFormat = AddressFormat.P2WPKH;
          break;
        case 86:
          addressFormat = AddressFormat.P2TR;
          break;
        default:
          addressFormat = AddressFormat.P2WPKH;
      }

      const account = (request.path[2] ?? 0) & ~DerivationPaths.HARDENED;
      const index = request.path[4] ?? 0;
      const addressResult = await this.getAddress(addressFormat, account, index, false, false);

      return {
        signature: result.signature,
        address: addressResult.address,
      };
    } catch (error) {
      if (error instanceof HardwareWalletError) {
        throw error;
      }
      throw new HardwareWalletError(
        `Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SIGN_MESSAGE_FAILED',
        'ledger',
        'Failed to sign message. Please check your Ledger and try again.'
      );
    }
  }

  /**
   * Sign a PSBT (Partially Signed Bitcoin Transaction)
   */
  async signPsbt(request: HardwarePsbtSignRequest): Promise<{ signedPsbtHex: string }> {
    this.ensureInitialized();
    await this.connectDevice();

    if (!this.signer) {
      throw new HardwareWalletError(
        'Bitcoin signer not initialized',
        'SIGNER_NOT_INITIALIZED',
        'ledger'
      );
    }

    try {
      const { psbtHex, inputPaths } = request;

      // Convert hex to base64 as Ledger expects base64
      const psbtBytes = Buffer.from(psbtHex, 'hex');
      const psbtBase64 = psbtBytes.toString('base64');

      // Determine the address format from the first input's path
      const firstPath = inputPaths.values().next().value;
      if (!firstPath) {
        throw new HardwareWalletError(
          'No input paths provided',
          'NO_INPUT_PATHS',
          'ledger'
        );
      }

      const purpose = firstPath[0] & ~DerivationPaths.HARDENED;
      let addressFormat: AddressFormat;
      switch (purpose) {
        case 44:
          addressFormat = AddressFormat.P2PKH;
          break;
        case 49:
          addressFormat = AddressFormat.P2SH_P2WPKH;
          break;
        case 84:
          addressFormat = AddressFormat.P2WPKH;
          break;
        case 86:
          addressFormat = AddressFormat.P2TR;
          break;
        default:
          addressFormat = AddressFormat.P2WPKH;
      }

      const account = (firstPath[2] ?? 0) & ~DerivationPaths.HARDENED;

      // Create wallet for signing
      const wallet = this.createDefaultWallet(addressFormat, account);

      // Sign the PSBT (requires user confirmation on device)
      const result = await this.executeSignerAction<{ psbt: string }>(
        this.signer.signPsbt(wallet, psbtBase64),
        'signPsbt',
        LONG_OPERATION_TIMEOUT_MS
      );

      // Convert result back to hex
      const signedPsbtBytes = Buffer.from(result.psbt, 'base64');
      const signedPsbtHex = signedPsbtBytes.toString('hex');

      return { signedPsbtHex };
    } catch (error) {
      if (error instanceof HardwareWalletError) {
        throw error;
      }
      throw new HardwareWalletError(
        `Failed to sign PSBT: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SIGN_PSBT_FAILED',
        'ledger',
        'Failed to sign transaction. Please check your Ledger and try again.'
      );
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    // Abort any pending operations
    const abortedCount = abortAllOperations('ledger', 'Adapter disposed');
    if (abortedCount > 0 && this.options.debug) {
      console.log(`[Ledger] Disposed, aborted ${abortedCount} pending operations`);
    }

    if (this.dmk && this.sessionId) {
      try {
        await this.dmk.disconnect({ sessionId: this.sessionId });
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    this.dmk = null;
    this.sessionId = null;
    this.signer = null;
    this.initialized = false;
    this.connectionStatus = 'disconnected';
    this.deviceInfo = null;
  }

  /**
   * Ensure the adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new HardwareWalletError(
        'Ledger adapter not initialized. Call init() first.',
        'NOT_INITIALIZED',
        'ledger',
        'Hardware wallet not initialized. Please reconnect.'
      );
    }
  }

  /**
   * Execute a signer action that returns an Observable and convert to Promise
   * @param action - The signer action containing an Observable
   * @param operationName - Human-readable name for error messages
   * @param timeoutMs - Custom timeout in milliseconds (default: operation timeout or 60s)
   */
  private async executeSignerAction<T>(
    action: { observable: import('rxjs').Observable<any> },
    operationName: string = 'operation',
    timeoutMs?: number
  ): Promise<T> {
    const effectiveTimeout = timeoutMs ?? this.options.operationTimeout ?? DEFAULT_TIMEOUT_MS;

    const finalState = await firstValueFrom(
      action.observable.pipe(
        filter((state: any) =>
          state.status === 'completed' || state.status === 'error'
        ),
        timeout(effectiveTimeout),
        catchError((err) => {
          // Check if it's a timeout error
          if (err.name === 'TimeoutError') {
            throw new HardwareWalletError(
              `Operation timed out after ${effectiveTimeout}ms: ${operationName}`,
              'OPERATION_TIMEOUT',
              'ledger',
              `The ${operationName} took too long. Please check your Ledger device and try again.`
            );
          }
          throw new HardwareWalletError(
            `Operation failed: ${err.message ?? 'Unknown error'}`,
            'OPERATION_FAILED',
            'ledger',
            'The operation failed. Please try again.'
          );
        })
      )
    );

    if (finalState.status === 'error') {
      const errorMsg = finalState.error?.message?.toLowerCase() ?? '';
      // Check for user cancellation
      if (errorMsg.includes('denied') || errorMsg.includes('rejected') || errorMsg.includes('cancel')) {
        throw new HardwareWalletError(
          `${operationName} was cancelled by user`,
          'USER_CANCELLED',
          'ledger',
          'You cancelled the operation on your Ledger.'
        );
      }
      throw new HardwareWalletError(
        `Ledger ${operationName} failed: ${finalState.error?.message ?? 'Unknown error'}`,
        'DEVICE_ERROR',
        'ledger',
        finalState.error?.message ?? 'An error occurred on the device.'
      );
    }

    return finalState.output as T;
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
