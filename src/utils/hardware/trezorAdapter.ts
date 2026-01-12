/**
 * Trezor Hardware Wallet Adapter
 *
 * Implementation of IHardwareWalletAdapter for Trezor devices.
 * Uses @trezor/connect-webextension for browser extension service worker communication.
 *
 * Supports two modes:
 * - Production mode (popup: true): Opens Trezor Connect popup for user interaction
 * - Test/Emulator mode (popup: false): Direct communication with Trezor Bridge for automated testing
 */

import TrezorConnect, { DEVICE_EVENT, DEVICE, UI } from '@trezor/connect-webextension';
import { AddressFormat, decodeAddressFromScript } from '@/utils/blockchain/bitcoin/address';
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
import { extractPsbtDetails } from '@/utils/blockchain/bitcoin/psbt';

/**
 * Configuration options for TrezorAdapter initialization
 */
export interface TrezorAdapterOptions {
  /** Use test/emulator mode (no popup, direct bridge communication) */
  testMode?: boolean;
  /** Custom connect source URL (for local development/testing) */
  connectSrc?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Callback for UI button requests (for auto-confirm in tests) */
  onButtonRequest?: (code: string) => void;
}

// Trezor script type mappings
const INPUT_SCRIPT_TYPES = {
  'SPENDADDRESS': 'SPENDADDRESS',
  'SPENDWITNESS': 'SPENDWITNESS',
  'SPENDP2SHWITNESS': 'SPENDP2SHWITNESS',
  'SPENDTAPROOT': 'SPENDTAPROOT',
} as const;

const OUTPUT_SCRIPT_TYPES = {
  'PAYTOADDRESS': 'PAYTOADDRESS',
  'PAYTOWITNESS': 'PAYTOWITNESS',
  'PAYTOP2SHWITNESS': 'PAYTOP2SHWITNESS',
  'PAYTOTAPROOT': 'PAYTOTAPROOT',
  'PAYTOOPRETURN': 'PAYTOOPRETURN',
} as const;

/**
 * Get Trezor script type for address format
 */
function getScriptType(addressFormat: AddressFormat, isInput: boolean): string {
  switch (addressFormat) {
    case AddressFormat.P2PKH:
    case AddressFormat.Counterwallet:
      return isInput ? 'SPENDADDRESS' : 'PAYTOADDRESS';
    case AddressFormat.P2WPKH:
    case AddressFormat.CounterwalletSegwit:
      return isInput ? 'SPENDWITNESS' : 'PAYTOWITNESS';
    case AddressFormat.P2SH_P2WPKH:
      return isInput ? 'SPENDP2SHWITNESS' : 'PAYTOP2SHWITNESS';
    case AddressFormat.P2TR:
      return isInput ? 'SPENDTAPROOT' : 'PAYTOTAPROOT';
    default:
      return isInput ? 'SPENDADDRESS' : 'PAYTOADDRESS';
  }
}

/**
 * Trezor Hardware Wallet Adapter
 */
export class TrezorAdapter implements IHardwareWalletAdapter {
  private initialized = false;
  private connectionStatus: HardwareConnectionStatus = 'disconnected';
  private deviceInfo: HardwareDeviceInfo | null = null;
  private options: TrezorAdapterOptions = {};

  /**
   * Initialize Trezor Connect
   * @param options Configuration options for test mode or custom settings
   */
  async init(options?: TrezorAdapterOptions): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.options = options ?? {};

    try {
      this.connectionStatus = 'connecting';

      // Determine configuration based on mode
      const isTestMode = this.options.testMode === true;
      const debug = this.options.debug ?? process.env.NODE_ENV === 'development';

      // Build init configuration
      const initConfig: Parameters<typeof TrezorConnect.init>[0] = {
        manifest: {
          appName: 'XCP Wallet',
          email: 'support@xcpwallet.com',
          appUrl: 'https://xcpwallet.com',
        },
        debug,
      };

      if (isTestMode) {
        // Test/Emulator mode: Direct bridge communication
        // This allows automated testing against the Trezor emulator
        initConfig.popup = false;
        initConfig.transports = ['BridgeTransport'];
        initConfig.pendingTransportEvent = true;
        initConfig.transportReconnect = false;

        // Allow custom connect source for local testing
        if (this.options.connectSrc) {
          initConfig.connectSrc = this.options.connectSrc;
        }
      } else {
        // Production mode: Use popup for user interactions
        initConfig.popup = true;
        initConfig.transports = ['WebUsbTransport'];
      }

      await TrezorConnect.init(initConfig);

      // Listen for device events
      TrezorConnect.on(DEVICE_EVENT, (event) => {
        if (event.type === DEVICE.CONNECT) {
          this.connectionStatus = 'connected';
          this.deviceInfo = {
            vendor: 'trezor',
            model: event.payload.features?.model,
            label: event.payload.features?.label ?? undefined,
            firmwareVersion: event.payload.features
              ? `${event.payload.features.major_version}.${event.payload.features.minor_version}.${event.payload.features.patch_version}`
              : undefined,
            connected: true,
          };
        } else if (event.type === DEVICE.DISCONNECT) {
          this.connectionStatus = 'disconnected';
          if (this.deviceInfo) {
            this.deviceInfo.connected = false;
          }
        }
      });

      // In test mode, listen for button requests for auto-confirm
      if (isTestMode && this.options.onButtonRequest) {
        TrezorConnect.on(UI.REQUEST_BUTTON, (event) => {
          const code = (event as any).payload?.code ?? 'unknown';
          this.options.onButtonRequest?.(code);
        });
      }

      // Handle confirmation dialogs in test mode
      if (isTestMode) {
        TrezorConnect.on(UI.REQUEST_CONFIRMATION, () => {
          TrezorConnect.uiResponse({
            type: UI.RECEIVE_CONFIRMATION,
            payload: true,
          });
        });
      }

      this.initialized = true;
      this.connectionStatus = 'disconnected'; // Will change to connected when device connects
    } catch (error) {
      this.connectionStatus = 'error';
      throw new HardwareWalletError(
        `Failed to initialize Trezor Connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_FAILED',
        'trezor',
        'Failed to initialize Trezor connection. Please try again.'
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
   * Get device information
   */
  async getDeviceInfo(): Promise<HardwareDeviceInfo | null> {
    this.ensureInitialized();

    // Try to get features to verify device is connected
    const result = await TrezorConnect.getFeatures();

    if (result.success) {
      this.deviceInfo = {
        vendor: 'trezor',
        model: result.payload.model,
        label: result.payload.label ?? undefined,
        firmwareVersion: `${result.payload.major_version}.${result.payload.minor_version}.${result.payload.patch_version}`,
        connected: true,
      };
      this.connectionStatus = 'connected';
      return this.deviceInfo;
    }

    return this.deviceInfo;
  }

  /**
   * Get a single address from Trezor
   */
  async getAddress(
    addressFormat: AddressFormat,
    account: number = 0,
    index: number = 0,
    showOnDevice: boolean = false,
    usePassphrase: boolean = false
  ): Promise<HardwareAddress> {
    this.ensureInitialized();

    const pathArray = DerivationPaths.getBip44Path(addressFormat, account, 0, index);
    // Use string path format to avoid JavaScript signed integer issues with hardened values
    const pathString = DerivationPaths.pathToString(pathArray);
    const scriptType = getScriptType(addressFormat, false);

    const result = await TrezorConnect.getAddress({
      path: pathString,
      coin: 'btc',
      showOnTrezor: showOnDevice,
      scriptType: scriptType as any,
      useEmptyPassphrase: !usePassphrase,
    });

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to get address: ${result.payload.error}`,
        result.payload.code ?? 'GET_ADDRESS_FAILED',
        'trezor',
        'Failed to get address from Trezor. Please check your device and try again.'
      );
    }

    return {
      address: result.payload.address,
      publicKey: (result.payload as any).publicKey ?? '',
      path: pathString,
    };
  }

  /**
   * Get multiple addresses from Trezor
   */
  async getAddresses(
    addressFormat: AddressFormat,
    account: number,
    startIndex: number,
    count: number,
    usePassphrase: boolean = false
  ): Promise<HardwareAddress[]> {
    this.ensureInitialized();

    const addresses: HardwareAddress[] = [];
    const scriptType = getScriptType(addressFormat, false);

    // Build bundle of address requests using string paths
    // to avoid JavaScript signed integer issues with hardened values
    const pathStrings: string[] = [];
    const bundle = Array.from({ length: count }, (_, i) => {
      const pathArray = DerivationPaths.getBip44Path(addressFormat, account, 0, startIndex + i);
      const pathString = DerivationPaths.pathToString(pathArray);
      pathStrings.push(pathString);
      return {
        path: pathString,
        coin: 'btc' as const,
        showOnTrezor: false,
        scriptType: scriptType as any,
      };
    });

    const result = await TrezorConnect.getAddress({ bundle, useEmptyPassphrase: !usePassphrase });

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to get addresses: ${result.payload.error}`,
        result.payload.code ?? 'GET_ADDRESSES_FAILED',
        'trezor',
        'Failed to get addresses from Trezor. Please check your device and try again.'
      );
    }

    for (let i = 0; i < result.payload.length; i++) {
      const addr = result.payload[i] as any;
      addresses.push({
        address: addr.address,
        publicKey: addr.publicKey ?? '',
        path: pathStrings[i],
      });
    }

    return addresses;
  }

  /**
   * Get extended public key (xpub) for an account
   */
  async getXpub(addressFormat: AddressFormat, account: number = 0, usePassphrase: boolean = false): Promise<string> {
    this.ensureInitialized();

    const purpose = DerivationPaths.getPurpose(addressFormat);
    // Use string path format to avoid JavaScript signed integer issues with hardened values
    const path = `m/${purpose}'/${0}'/${account}'`;

    const result = await TrezorConnect.getPublicKey({
      path,
      coin: 'btc',
      useEmptyPassphrase: !usePassphrase,
    });

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to get xpub: ${result.payload.error}`,
        result.payload.code ?? 'GET_XPUB_FAILED',
        'trezor',
        'Failed to get extended public key from Trezor.'
      );
    }

    return result.payload.xpub;
  }

  /**
   * Sign a Bitcoin transaction
   */
  async signTransaction(request: HardwareSignRequest): Promise<HardwareSignResult> {
    this.ensureInitialized();

    // Convert inputs to Trezor format
    const inputs = request.inputs.map((input) => ({
      address_n: input.addressPath,
      prev_hash: input.prevTxHash,
      prev_index: input.prevIndex,
      amount: input.amount,
      script_type: INPUT_SCRIPT_TYPES[input.scriptType] as any,
    }));

    // Convert outputs to Trezor format
    const outputs = request.outputs.map((output) => {
      if (output.scriptType === 'PAYTOOPRETURN') {
        // OP_RETURN output - no address, amount must be 0
        return {
          script_type: OUTPUT_SCRIPT_TYPES.PAYTOOPRETURN as any,
          amount: '0',
          op_return_data: output.opReturnData,
        };
      } else if (output.addressPath) {
        // Change output - use address_n
        return {
          address_n: output.addressPath,
          amount: output.amount,
          script_type: OUTPUT_SCRIPT_TYPES[output.scriptType] as any,
        };
      } else {
        // External output - use address
        return {
          address: output.address,
          amount: output.amount,
          script_type: OUTPUT_SCRIPT_TYPES[output.scriptType] as any,
        };
      }
    });

    // Build the sign transaction request
    const signRequest: any = {
      inputs,
      outputs,
      coin: 'btc',
      push: false, // Don't broadcast, we'll do that ourselves
    };

    // Add referenced transactions if provided
    if (request.refTxs && request.refTxs.length > 0) {
      signRequest.refTxs = request.refTxs.map((refTx) => ({
        hash: refTx.hash,
        version: refTx.version,
        lock_time: refTx.locktime,
        inputs: refTx.inputs.map((input) => ({
          prev_hash: input.prevHash,
          prev_index: input.prevIndex,
          script_sig: input.script,
          sequence: input.sequence,
        })),
        bin_outputs: refTx.outputs.map((output) => ({
          amount: output.amount,
          script_pubkey: output.script,
        })),
      }));
    }

    const result = await TrezorConnect.signTransaction(signRequest);

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to sign transaction: ${result.payload.error}`,
        result.payload.code ?? 'SIGN_TX_FAILED',
        'trezor',
        'Failed to sign transaction. Please check your Trezor and try again.'
      );
    }

    return {
      signedTxHex: result.payload.serializedTx,
      txid: result.payload.txid,
    };
  }

  /**
   * Sign a message
   */
  async signMessage(request: HardwareMessageSignRequest): Promise<HardwareMessageSignResult> {
    this.ensureInitialized();

    const result = await TrezorConnect.signMessage({
      path: request.path,
      message: request.message,
      coin: request.coin ?? 'Bitcoin',
    });

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to sign message: ${result.payload.error}`,
        result.payload.code ?? 'SIGN_MESSAGE_FAILED',
        'trezor',
        'Failed to sign message. Please check your Trezor and try again.'
      );
    }

    return {
      signature: result.payload.signature,
      address: result.payload.address,
    };
  }

  /**
   * Sign a PSBT using Trezor
   *
   * This parses the PSBT, converts to Trezor format, signs, and returns
   * the signed transaction. Note: Trezor returns a fully signed raw tx,
   * not a PSBT, so this effectively finalizes the transaction.
   */
  async signPsbt(request: HardwarePsbtSignRequest): Promise<{ signedPsbtHex: string }> {
    this.ensureInitialized();

    const { psbtHex, inputPaths } = request;

    // Parse the PSBT to extract transaction details
    const psbtDetails = extractPsbtDetails(psbtHex);

    // Convert inputs to Trezor format
    const inputs: any[] = [];
    for (let i = 0; i < psbtDetails.inputs.length; i++) {
      const input = psbtDetails.inputs[i];
      const path = inputPaths.get(i);

      if (!path) {
        throw new HardwareWalletError(
          `No derivation path provided for input ${i}`,
          'MISSING_PATH',
          'trezor',
          'Unable to sign transaction: missing key information.'
        );
      }

      // Determine script type from the derivation path (purpose)
      const purpose = path[0] & ~DerivationPaths.HARDENED;
      let scriptType: string;
      switch (purpose) {
        case 44:
          scriptType = 'SPENDADDRESS';
          break;
        case 49:
          scriptType = 'SPENDP2SHWITNESS';
          break;
        case 84:
          scriptType = 'SPENDWITNESS';
          break;
        case 86:
          scriptType = 'SPENDTAPROOT';
          break;
        default:
          scriptType = 'SPENDWITNESS';
      }

      inputs.push({
        address_n: path,
        prev_hash: input.txid,
        prev_index: input.vout,
        amount: String(input.value ?? 0),
        script_type: scriptType,
      });
    }

    // Convert outputs to Trezor format
    const outputs: any[] = [];
    for (let i = 0; i < psbtDetails.outputs.length; i++) {
      const output = psbtDetails.outputs[i];

      if (output.type === 'op_return') {
        // OP_RETURN output
        outputs.push({
          script_type: 'PAYTOOPRETURN',
          amount: '0',
          op_return_data: output.opReturnData,
        });
      } else {
        // Regular output - decode address from script
        const address = decodeAddressFromScript(output.script);

        if (!address) {
          throw new HardwareWalletError(
            `Cannot decode address from output ${i} script`,
            'ADDRESS_DECODE_FAILED',
            'trezor',
            'Unable to decode output address from transaction.'
          );
        }

        // Determine output script type
        let outputScriptType: string;
        switch (output.type) {
          case 'p2pkh':
            outputScriptType = 'PAYTOADDRESS';
            break;
          case 'p2wpkh':
            outputScriptType = 'PAYTOWITNESS';
            break;
          case 'p2sh':
            outputScriptType = 'PAYTOP2SHWITNESS';
            break;
          case 'p2tr':
            outputScriptType = 'PAYTOTAPROOT';
            break;
          default:
            outputScriptType = 'PAYTOADDRESS';
        }

        outputs.push({
          address,
          amount: String(output.value),
          script_type: outputScriptType,
        });
      }
    }

    // Sign the transaction with Trezor
    const signRequest: any = {
      inputs,
      outputs,
      coin: 'btc',
      push: false,
    };

    const result = await TrezorConnect.signTransaction(signRequest);

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to sign PSBT: ${result.payload.error}`,
        result.payload.code ?? 'SIGN_PSBT_FAILED',
        'trezor',
        'Failed to sign transaction. Please check your Trezor and try again.'
      );
    }

    // Trezor returns a fully signed raw transaction
    // For PSBT compatibility, we return this as the "signed PSBT"
    // The caller should be aware this is actually a finalized raw tx
    return {
      signedPsbtHex: result.payload.serializedTx,
    };
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.initialized) {
      TrezorConnect.dispose();
      this.initialized = false;
      this.connectionStatus = 'disconnected';
      this.deviceInfo = null;
    }
  }

  /**
   * Ensure the adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new HardwareWalletError(
        'Trezor adapter not initialized. Call init() first.',
        'NOT_INITIALIZED',
        'trezor',
        'Hardware wallet not initialized. Please reconnect.'
      );
    }
  }
}

// Singleton instance
let trezorAdapterInstance: TrezorAdapter | null = null;

/**
 * Get the Trezor adapter singleton instance
 */
export function getTrezorAdapter(): TrezorAdapter {
  if (!trezorAdapterInstance) {
    trezorAdapterInstance = new TrezorAdapter();
  }
  return trezorAdapterInstance;
}

/**
 * Reset the Trezor adapter (for testing or cleanup)
 */
export async function resetTrezorAdapter(): Promise<void> {
  if (trezorAdapterInstance) {
    await trezorAdapterInstance.dispose();
    trezorAdapterInstance = null;
  }
}
