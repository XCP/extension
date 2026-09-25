/**
 * Trezor Hardware Wallet Adapter
 *
 * Implementation of IHardwareWalletAdapter for Trezor devices.
 * Uses @trezor/connect-webextension for browser extension service worker communication.
 *
 * ---
 * ADR-017: Hardware Wallet Integration Architecture
 * ---
 *
 * **Context**: Users need hardware wallet support (Trezor, Ledger) for secure key storage
 * where private keys never leave the device. Browser extensions have unique constraints:
 * MV3 service workers, popup lifecycle, and cross-origin communication.
 *
 * **Decision**: Implement hardware wallets via a unified adapter interface with device-specific
 * implementations:
 *
 * 1. **Vendor Abstraction (IHardwareWalletAdapter)**
 *    - Unified interface for all hardware wallet vendors
 *    - Device-specific logic isolated in adapter implementations
 *    - Allows adding new vendors (Ledger, etc.) without changing core wallet code
 *
 * 2. **Trezor Connect Webextension Package**
 *    - Uses @trezor/connect-webextension specifically for MV3 service worker compatibility
 *    - Standard @trezor/connect does NOT work in service workers
 *    - Communicates via Trezor Bridge (localhost:21325) or iframe popup
 *
 * 3. **No Key Material in Extension**
 *    - Private keys NEVER leave the hardware device
 *    - Extension sends unsigned transactions to device
 *    - Device returns signatures only
 *    - Eliminates risk class: memory extraction, JS heap inspection, extension compromise
 *
 * 4. **PSBT-Based Signing Flow**
 *    - PSBT (BIP-174) format for SegWit transactions
 *    - Extracts inputs/outputs from PSBT for Trezor SDK format
 *    - Reference transactions fetched for non-SegWit inputs (Trezor requirement)
 *
 * **Alternatives Considered**:
 * - Direct USB communication: Blocked by browser security model
 * - WebUSB API: Limited browser support, not in Firefox
 * - Injecting Trezor Connect into content script: CSP violations in MV3
 *
 * **Trade-offs**:
 * - Trezor popup UX adds friction (but user expects this for hardware wallets)
 * - @trezor/connect-webextension pulls large dependency tree (mitigated by build-time tree shaking)
 *
 * **Security Properties**:
 * - Device-bound keys: Keys generated on device, never exported
 * - Physical confirmation: User must confirm on device display
 * - WYSIWYS: What You See Is What You Sign - device shows transaction details
 * - No trust in extension: Compromised extension cannot sign without device
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { Script, Transaction } from '@scure/btc-signer';
import TrezorConnect from '@trezor/connect-webextension';
import { AddressFormat, decodeAddressFromScript } from '@/core/bitcoin/address';
import {
  extractPresignedExternalP2wpkhInput,
  importVerifiedHardwareP2wpkhSignatures,
} from '@/core/bitcoin/hardwarePsbt';
import { parsePSBT, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import { assertTransactionMatchesReviewed, parseTransactionForIntegrity } from '@/core/bitcoin/transactionIntegrity';
import type { IHardwareWalletAdapter } from '@/core/hardware/interface';
import {
  DerivationPaths,
  type HardwareAddress,
  type HardwareConnectionStatus,
  type HardwareDeviceInfo,
  type HardwareMessageSignRequest,
  type HardwareMessageSignResult,
  type HardwarePsbtSignRequest,
  type HardwarePsbtSignResult,
  type HardwareSignRequest,
  type HardwareSignResult,
  HardwareWalletError,
  type InputScriptType,
  type OutputScriptType,
} from '@/core/hardware/types';
import { toSafeInteger } from '@/core/numeric';

// Use the SDK's discriminated types so API changes surface at compile time.
type TrezorSignTransactionRequest = Parameters<typeof TrezorConnect.signTransaction>[0];
type TrezorSignInput = TrezorSignTransactionRequest['inputs'][number];
type TrezorSignOutput = TrezorSignTransactionRequest['outputs'][number];

// 0xfffffffd enables RBF.
const RBF_SEQUENCE = 0xfffffffd;

/**
 * Configuration options for TrezorAdapter initialization
 */
export interface TrezorAdapterOptions {
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Get input script type for address format
 */
function getInputScriptType(addressFormat: AddressFormat): InputScriptType {
  switch (addressFormat) {
    case AddressFormat.P2PKH:
    case AddressFormat.Counterwallet:
    case AddressFormat.FreewalletBIP39:
      return 'SPENDADDRESS';
    case AddressFormat.P2WPKH:
    case AddressFormat.CounterwalletSegwit:
    case AddressFormat.FreewalletBIP39Segwit:
      return 'SPENDWITNESS';
    case AddressFormat.P2SH_P2WPKH:
      return 'SPENDP2SHWITNESS';
    case AddressFormat.P2TR:
      return 'SPENDTAPROOT';
    default:
      return 'SPENDADDRESS';
  }
}

/**
 * Get output script type for address format
 */
function _getOutputScriptType(addressFormat: AddressFormat): OutputScriptType {
  switch (addressFormat) {
    case AddressFormat.P2PKH:
    case AddressFormat.Counterwallet:
    case AddressFormat.FreewalletBIP39:
      return 'PAYTOADDRESS';
    case AddressFormat.P2WPKH:
    case AddressFormat.CounterwalletSegwit:
    case AddressFormat.FreewalletBIP39Segwit:
      return 'PAYTOWITNESS';
    case AddressFormat.P2SH_P2WPKH:
      return 'PAYTOP2SHWITNESS';
    case AddressFormat.P2TR:
      return 'PAYTOTAPROOT';
    default:
      return 'PAYTOADDRESS';
  }
}

/**
 * Get input script type from BIP44 purpose value
 */
function getScriptTypeFromPurpose(purpose: number): InputScriptType {
  switch (purpose) {
    case 44:
      return 'SPENDADDRESS';
    case 49:
      return 'SPENDP2SHWITNESS';
    case 84:
      return 'SPENDWITNESS';
    case 86:
      return 'SPENDTAPROOT';
    default:
      return 'SPENDWITNESS';
  }
}

/**
 * Trezor Hardware Wallet Adapter
 */
/**
 * A bare multisig output script: OP_M <pubkey>... OP_N OP_CHECKMULTISIG.
 *
 * Counterparty writes these to carry message data past the 80-byte OP_RETURN limit, with the
 * payload encrypted into positions that look like pubkeys. Recognised here only to explain why
 * signing cannot proceed -- nothing tries to sign one.
 *
 * Matched structurally rather than by length: OP_CHECKMULTISIG last, a small OP_N before it, and
 * an OP_M at the front. Counterparty uses 1-of-3, but pinning that exactly would silently fall
 * back to the misleading error if the encoding ever changed shape.
 */
function isBareMultisigScript(scriptHex: string): boolean {
  const OP_CHECKMULTISIG = 0xae;
  const OP_1 = 0x51;
  const OP_16 = 0x60;
  // Hex, because that is how extractPsbtDetails hands over an output script.
  if (!/^([0-9a-fA-F]{2})+$/.test(scriptHex)) return false;
  const byteCount = scriptHex.length / 2;
  if (byteCount < 3) return false;
  const at = (index: number) => Number.parseInt(scriptHex.slice(index * 2, index * 2 + 2), 16);
  const m = at(0);
  const n = at(byteCount - 2);
  return (
    at(byteCount - 1) === OP_CHECKMULTISIG &&
    n >= OP_1 && n <= OP_16 &&
    m >= OP_1 && m <= OP_16
  );
}

export class TrezorAdapter implements IHardwareWalletAdapter {
  private initialized = false;
  private connectionStatus: HardwareConnectionStatus = 'disconnected';
  private deviceInfo: HardwareDeviceInfo | null = null;
  private options: TrezorAdapterOptions = {};

  /**
   * Initialize Trezor Connect
   * @param options Debug logging options
   */
  async init(options?: TrezorAdapterOptions): Promise<void> {
    console.log('[TrezorAdapter] init called, already initialized:', this.initialized);
    if (this.initialized) {
      console.log('[TrezorAdapter] Already initialized, returning early');
      return;
    }

    this.options = options ?? {};
    console.log('[TrezorAdapter] Starting initialization...');

    try {
      this.connectionStatus = 'connecting';

      const debug = this.options.debug ?? process.env.NODE_ENV === 'development';

      // Suite handles device interaction; direct Bridge transport is confined to emulator tests.
      const initConfig: Parameters<typeof TrezorConnect.init>[0] = {
        manifest: {
          appName: 'XCP Wallet',
          email: 'support@xcpwallet.com',
          appUrl: 'https://xcpwallet.com',
        },
        debug,
        coreMode: 'auto',
        env: 'webextension',
      };

      console.log('[TrezorAdapter] Calling TrezorConnect.init with config:', JSON.stringify(initConfig, null, 2));
      await TrezorConnect.init(initConfig);
      console.log('[TrezorAdapter] TrezorConnect.init completed successfully');

      this.initialized = true;
      // Connect 10 removed the device event stream, so there is nothing to subscribe to.
      // Connection state is established by the first getDeviceInfo() or pingDevice() call.
      this.connectionStatus = 'disconnected';
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
   * Check whether the connected Trezor is responsive without requiring user confirmation.
   */
  async pingDevice(): Promise<boolean> {
    this.ensureInitialized();

    // pingDevice moved into the management API, which the public surface omits. getFeatures
    // answers the same question - is the device reachable - without a device confirmation.
    const result = await TrezorConnect.getFeatures();

    if (result.success) {
      this.connectionStatus = 'connected';
      if (this.deviceInfo) {
        this.deviceInfo.connected = true;
      }
      return true;
    }

    this.connectionStatus = 'disconnected';
    if (this.deviceInfo) {
      this.deviceInfo.connected = false;
    }
    return false;
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
    // getAddress expects INPUT script types (SPEND*), not output types (PAYTO*)
    const scriptType = getInputScriptType(addressFormat);

    const result = await TrezorConnect.getAddress({
      path: pathString,
      coin: 'btc',
      showOnTrezor: showOnDevice,
      scriptType: scriptType,
      device: { useEmptyPassphrase: !usePassphrase },
    });

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to get address: ${result.error.message}`,
        result.error.code ?? 'GET_ADDRESS_FAILED',
        'trezor',
        'Failed to get address from Trezor. Please check your device and try again.'
      );
    }

    // Single address response
    const addr = result.payload as { address: string; publicKey?: string; path: number[]; serializedPath: string };
    return {
      address: addr.address,
      publicKey: addr.publicKey ?? '',
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
    // getAddress expects INPUT script types (SPEND*), not output types (PAYTO*)
    const scriptType = getInputScriptType(addressFormat);

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
        scriptType: scriptType,
      };
    });

    const result = await TrezorConnect.getAddress({ bundle, device: { useEmptyPassphrase: !usePassphrase } });

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to get addresses: ${result.error.message}`,
        result.error.code ?? 'GET_ADDRESSES_FAILED',
        'trezor',
        'Failed to get addresses from Trezor. Please check your device and try again.'
      );
    }

    // Bundle response is an array
    const addressResults = result.payload as Array<{ address: string; publicKey?: string; path: number[]; serializedPath: string }>;
    if (addressResults.length !== pathStrings.length) {
      throw new HardwareWalletError(
        `Trezor returned ${addressResults.length} addresses for ${pathStrings.length} requested paths`,
        'GET_ADDRESSES_FAILED',
        'trezor',
        'Trezor returned an unexpected response. Please reconnect your device and try again.'
      );
    }
    for (let i = 0; i < addressResults.length; i++) {
      const addr = addressResults[i]!;
      addresses.push({
        address: addr.address,
        publicKey: addr.publicKey ?? '',
        path: pathStrings[i]!,
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
      device: { useEmptyPassphrase: !usePassphrase },
    });

    if (!result.success) {
      throw new HardwareWalletError(
        `Failed to get xpub: ${result.error.message}`,
        result.error.code ?? 'GET_XPUB_FAILED',
        'trezor',
        'Failed to get extended public key from Trezor.'
      );
    }

    return result.payload.xpub;
  }

  /**
   * Discover Bitcoin accounts on the device using BIP-44 account discovery.
   *
   * Suite selects the account and returns its xpub. Read address zero explicitly,
   * matching the /0/0 derivation path stored by WalletManager.
   *
   * @param usePassphrase - Whether to use passphrase-protected wallet
   * @returns Discovered account information including path, first address, and xpub
   */
  async discoverAccount(usePassphrase: boolean = false): Promise<{
    path: string;
    address: string;
    addressFormat: AddressFormat;
    accountIndex: number;
    xpub: string;
  }> {
    this.ensureInitialized();
    console.log('[TrezorAdapter] discoverAccount called, usePassphrase:', usePassphrase);

    // getAccountInfo no longer discovers - it rejects a request with neither path nor
    // descriptor. selectAccount is the replacement, and it returns the address and xpub
    // directly, so the descriptor no longer has to be parsed for the xpub.
    console.log('[TrezorAdapter] Calling TrezorConnect.selectAccount...');
    const result = await TrezorConnect.selectAccount({
      coin: 'btc',
      selectionType: 'single',
      addressSelection: 'fullAccount',
      device: { useEmptyPassphrase: !usePassphrase },
    });
    console.log('[TrezorAdapter] selectAccount success:', result.success);

    if (!result.success) {
      const errorMsg = result.error.message?.toLowerCase() || '';
      console.error('[TrezorAdapter] Discovery failed:', result.error);
      const errorCode = result.error.code ?? 'DISCOVERY_FAILED';

      // Provide specific error messages for common failure modes
      if (errorMsg.includes('cancelled') || errorMsg.includes('cancel')) {
        throw new HardwareWalletError(
          'User cancelled the operation',
          'USER_CANCELLED',
          'trezor',
          'Connection cancelled. Click Connect Trezor to try again.'
        );
      }

      if (errorMsg.includes('session not found') || errorMsg.includes('device disconnected')) {
        throw new HardwareWalletError(
          'Device disconnected',
          'DEVICE_DISCONNECTED',
          'trezor',
          'Trezor was disconnected. Please reconnect and try again.'
        );
      }

      if (errorMsg.includes('permissions') || errorMsg.includes('not permitted')) {
        throw new HardwareWalletError(
          'Permission denied',
          'PERMISSION_DENIED',
          'trezor',
          'Please grant permissions in Trezor Suite and try again.'
        );
      }

      if (errorMsg.includes('busy') || errorMsg.includes('in use')) {
        throw new HardwareWalletError(
          'Device is busy',
          'DEVICE_BUSY',
          'trezor',
          'Another application is using your Trezor. Please close other apps and try again.'
        );
      }

      // Default error
      throw new HardwareWalletError(
        `Account discovery failed: ${result.error.message}`,
        errorCode,
        'trezor',
        'Failed to discover accounts. Please check your device and try again.'
      );
    }

    // selectionType 'single' still returns an array.
    const account = result.payload[0];
    if (!account?.path) {
      throw new HardwareWalletError(
        'Device returned incomplete account information (missing path)',
        'INVALID_RESPONSE',
        'trezor',
        'The device returned incomplete account information. Please try again.'
      );
    }

    // Validate and parse the account path using the utility
    const parsedPath = DerivationPaths.parseAccountPath(account.path);
    if (!parsedPath) {
      throw new HardwareWalletError(
        `Invalid account path from device: ${account.path}`,
        'INVALID_PATH',
        'trezor',
        'The device returned an unexpected account path format.'
      );
    }

    if (!account.xpub) {
      throw new HardwareWalletError(
        'Device returned no extended public key for the selected account',
        'INVALID_RESPONSE',
        'trezor',
        'The device returned incomplete account information. Please try again.'
      );
    }

    const addressFormat = parsedPath.addressFormat;
    // A fresh address may be at a later index. The wallet records /0/0, so never
    // pair an arbitrary address from the account picker with that signing path.
    const address = (await this.getAddress(addressFormat, parsedPath.accountIndex, 0, false, usePassphrase)).address;

    return {
      path: account.path,
      address,
      addressFormat,
      accountIndex: parsedPath.accountIndex,
      xpub: account.xpub,
    };
  }

  /**
   * Sign a Bitcoin transaction
   */
  async signTransaction(request: HardwareSignRequest): Promise<HardwareSignResult> {
    this.ensureInitialized();

    // Convert inputs to Trezor format
    const inputs: TrezorSignInput[] = request.inputs.map((input) => ({
      address_n: input.addressPath,
      prev_hash: input.prevTxHash,
      prev_index: input.prevIndex,
      amount: input.amount,
      script_type: input.scriptType,
      sequence: RBF_SEQUENCE,
    }));

    // Convert outputs to Trezor format
    const outputs: TrezorSignOutput[] = request.outputs.map((output) => {
      if (output.scriptType === 'PAYTOOPRETURN') {
        // OP_RETURN output - no address, amount must be 0
        return {
          script_type: 'PAYTOOPRETURN' as const,
          amount: '0',
          op_return_data: output.opReturnData ?? '',
        };
      } else if (output.addressPath) {
        // Change output - use address_n
        return {
          address_n: output.addressPath,
          amount: output.amount,
          script_type: output.scriptType,
        };
      } else {
        if (!output.address) {
          throw new HardwareWalletError('Transaction output is missing an address', 'INVALID_OUTPUT', 'trezor');
        }
        // External address outputs must use PAYTOADDRESS. Trezor infers the
        // actual script from the address; SegWit/Taproot PAYTO* types are for
        // change outputs that use address_n.
        return {
          address: output.address,
          amount: output.amount,
          script_type: 'PAYTOADDRESS',
        };
      }
    });

    // Build the sign transaction request
    const signRequest: TrezorSignTransactionRequest = {
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
          amount: toSafeInteger(output.amount) ?? 0,
          script_pubkey: output.script,
        })),
      }));
    }

    const result = await TrezorConnect.signTransaction(signRequest);

    if (!result.success) {
      await this.recoverFromSignFailure(result.error.code);
      throw new HardwareWalletError(
        `Failed to sign transaction: ${result.error.message}`,
        result.error.code ?? 'SIGN_TX_FAILED',
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

    // Check for Taproot path (purpose 86') - Trezor doesn't support Taproot message signing
    const purposeSegment = request.path[0];
    if (purposeSegment === undefined) {
      throw new HardwareWalletError(
        'Empty derivation path in message signing request',
        'INVALID_PATH',
        'trezor',
        'Invalid derivation path. Please try again.'
      );
    }
    const purpose = purposeSegment & ~DerivationPaths.HARDENED;
    if (purpose === 86) {
      throw new HardwareWalletError(
        'Trezor does not support message signing for Taproot (P2TR) addresses',
        'TAPROOT_SIGNING_NOT_SUPPORTED',
        'trezor',
        'Trezor cannot sign messages with Taproot addresses. Use a wallet with a different address type (e.g., Native SegWit).'
      );
    }

    const result = await TrezorConnect.signMessage({
      path: request.path,
      message: request.message,
      coin: 'btc',
    });

    if (!result.success) {
      // Provide better error message for script type errors
      const errorMsg = result.error.message?.toLowerCase() || '';
      if (errorMsg.includes('script type') || errorMsg.includes('unsupported')) {
        throw new HardwareWalletError(
          `Failed to sign message: ${result.error.message}`,
          result.error.code ?? 'SIGN_MESSAGE_FAILED',
          'trezor',
          'This address type is not supported for message signing on Trezor. Try using a Native SegWit (bc1q...) address.'
        );
      }

      throw new HardwareWalletError(
        `Failed to sign message: ${result.error.message}`,
        result.error.code ?? 'SIGN_MESSAGE_FAILED',
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
   * Trezor Connect returns a raw transaction. Provider mode accepts P2WPKH SIGHASH_ALL inputs
   * selected for this device plus already-signed P2WPKH SIGHASH_ALL external inputs. It verifies
   * the returned transaction and signatures, then reconstructs the PSBT expected by external dApps.
   *
   * @param request - PSBT signing request containing:
   *   - psbtHex: The PSBT to sign (parsed internally)
   *   - inputPaths: Map of input index to BIP32 derivation paths
   * @returns The raw device transaction and an optional verified signed PSBT
   */
  async signPsbt(request: HardwarePsbtSignRequest): Promise<HardwarePsbtSignResult> {
    this.ensureInitialized();

    const { psbtHex, inputPaths, sighashTypes, resultFormat = 'raw_transaction' } = request;

    const transaction = parsePSBT(psbtHex);
    // Build the SDK's transaction in parallel. This catches any script/amount normalization
    // before the device is asked to sign, including noncanonical OP_RETURN push encodings.
    const mapped = new Transaction({
      version: transaction.version,
      lockTime: transaction.lockTime,
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      disableScriptCheck: true,
    });

    // Convert inputs to Trezor format
    const inputs: TrezorSignInput[] = [];
    for (let i = 0; i < transaction.inputsLength; i++) {
      const input = transaction.getInput(i);
      const path = inputPaths.get(i);

      // Validate input value - don't silently default to 0
      const prevout = (input.index === undefined ? undefined : input.nonWitnessUtxo?.outputs[input.index])
        ?? input.witnessUtxo;
      if (prevout?.amount === undefined || !input.txid || input.index === undefined) {
        throw new HardwareWalletError(
          `PSBT input ${i} is missing value (amount in satoshis)`,
          'INVALID_PSBT',
          'trezor',
          'Transaction data is incomplete. The input amount is missing.'
        );
      }

      const scriptType = path ? getScriptTypeFromPurpose(path[0]! & ~DerivationPaths.HARDENED) : undefined;
      const sighashType = resolvePsbtSighashType(path ? sighashTypes?.[i] : undefined, input.sighashType);
      const taprootDefault = resultFormat === 'raw_transaction' && scriptType === 'SPENDTAPROOT' && sighashType === 0x00;
      if (sighashType !== 0x01 && !taprootDefault) {
        throw new HardwareWalletError(
          `Trezor input ${i} requires unsupported sighash type 0x${sighashType.toString(16)}`,
          'UNSUPPORTED_SIGHASH',
          'trezor',
          'This hardware wallet can sign only ordinary SIGHASH_ALL transactions.',
        );
      }
      if (path && sighashTypes?.[i] !== undefined) {
        transaction.updateInput(i, { sighashType }, true);
      }

      if (!path) {
        if (resultFormat !== 'signed_psbt') {
          throw new HardwareWalletError(
            `No derivation path provided for input ${i}`,
            'MISSING_PATH',
            'trezor',
            'Unable to sign transaction: missing key information.'
          );
        }
        let external: ReturnType<typeof extractPresignedExternalP2wpkhInput>;
        try {
          external = extractPresignedExternalP2wpkhInput(psbtHex, i);
        } catch (error) {
          throw new HardwareWalletError(
            `Unsupported external input ${i}: ${error instanceof Error ? error.message : 'unknown error'}`,
            'UNSUPPORTED_EXTERNAL_INPUT',
            'trezor',
            'Trezor can preserve only an already-signed Native SegWit SIGHASH_ALL input.',
          );
        }
        inputs.push({
          prev_hash: bytesToHex(input.txid),
          prev_index: input.index,
          amount: String(prevout.amount),
          script_type: 'EXTERNAL',
          script_pubkey: external.scriptPubKey,
          script_sig: external.scriptSig,
          witness: external.witness,
          sequence: input.sequence ?? 0xffffffff,
        });
        mapped.addInput({ txid: input.txid, index: input.index, sequence: input.sequence ?? 0xffffffff });
        continue;
      }

      if (resultFormat === 'signed_psbt' && scriptType !== 'SPENDWITNESS') {
        throw new HardwareWalletError(
          `Provider PSBT input ${i} uses unsupported script type ${scriptType}`,
          'UNSUPPORTED_PROVIDER_PSBT',
          'trezor',
          'Trezor provider signing currently supports Native SegWit inputs only.',
        );
      }

      inputs.push({
        address_n: path,
        prev_hash: bytesToHex(input.txid),
        prev_index: input.index,
        amount: String(prevout.amount),
        script_type: scriptType!,
        sequence: input.sequence ?? 0xffffffff,
      });
      mapped.addInput({ txid: input.txid, index: input.index, sequence: input.sequence ?? 0xffffffff });
    }

    // Convert outputs to Trezor format
    const outputs: TrezorSignOutput[] = [];
    for (let i = 0; i < transaction.outputsLength; i++) {
      const output = transaction.getOutput(i);
      if (!output.script || output.amount === undefined) {
        throw new HardwareWalletError(`PSBT output ${i} is incomplete`, 'INVALID_PSBT', 'trezor');
      }
      const scriptHex = bytesToHex(output.script);

      if (output.script[0] === 0x6a) {
        const decoded = Script.decode(output.script);
        const data = decoded[1];
        if (output.amount !== 0n || decoded.length !== 2 || !(data instanceof Uint8Array)) {
          throw new HardwareWalletError(
            `PSBT output ${i} cannot be represented exactly as a hardware OP_RETURN output`,
            'UNSUPPORTED_OUTPUT_SCRIPT',
            'trezor',
            'The transaction contains a data output the device cannot reproduce exactly. Rebuild the transaction.',
          );
        }
        outputs.push({
          script_type: 'PAYTOOPRETURN',
          amount: '0',
          op_return_data: bytesToHex(data),
        });
        mapped.addOutput({ script: Script.encode(['RETURN', data]), amount: 0n });
      } else {
        // Regular output - decode address from script
        const address = decodeAddressFromScript(scriptHex);

        if (!address) {
          // Bare multisig is the one that actually happens here, and it is not a decoding
          // problem. Counterparty moves a message past 80 bytes out of OP_RETURN and into P2MS
          // data outputs whose "pubkeys" are encrypted payload, and no hardware wallet can sign
          // that: a P2MS output has no address, and Trezor Connect has no output type that
          // describes one (PAYTOMULTISIG means paying your own multisig account with real,
          // derivable keys). Saying "cannot decode address" sends the user looking at their
          // recipients, which are fine.
          if (isBareMultisigScript(scriptHex)) {
            throw new HardwareWalletError(
              `Output ${i} is a bare multisig data output`,
              'UNSUPPORTED_OUTPUT_SCRIPT',
              'trezor',
              'Hardware wallets cannot sign this transaction. Counterparty encoded it as bare ' +
                'multisig because the data outgrew the 80-byte OP_RETURN limit — for an MPMA ' +
                'send, that means too many recipients. Send to fewer recipients at a time, or ' +
                'use a software wallet address for this transaction.'
            );
          }
          throw new HardwareWalletError(
            `Cannot decode address from output ${i} script`,
            'ADDRESS_DECODE_FAILED',
            'trezor',
            'Unable to decode output address from transaction.'
          );
        }

        // PSBT outputs are passed as external address outputs here. Trezor
        // requires PAYTOADDRESS for any output with an address and infers the
        // concrete script from that address.
        outputs.push({
          address,
          amount: String(output.amount),
          script_type: 'PAYTOADDRESS',
        });
        mapped.addOutputAddress(address, output.amount);
      }
    }

    assertTransactionMatchesReviewed(mapped, transaction);

    // Sign the transaction with Trezor
    const signRequest: TrezorSignTransactionRequest = {
      inputs,
      outputs,
      coin: 'btc',
      push: false,
      version: transaction.version,
      locktime: transaction.lockTime,
    };

    const result = await TrezorConnect.signTransaction(signRequest);

    if (!result.success) {
      await this.recoverFromSignFailure(result.error.code);
      throw new HardwareWalletError(
        `Failed to sign PSBT: ${result.error.message}`,
        result.error.code ?? 'SIGN_PSBT_FAILED',
        'trezor',
        'Failed to sign transaction. Please check your Trezor and try again.'
      );
    }

    assertTransactionMatchesReviewed(parseTransactionForIntegrity(result.payload.serializedTx), transaction);

    const signedTxHex = result.payload.serializedTx;
    if (resultFormat === 'signed_psbt') {
      try {
        return {
          signedTxHex,
          signedPsbtHex: importVerifiedHardwareP2wpkhSignatures(
            bytesToHex(transaction.toPSBT()),
            signedTxHex,
            [...inputPaths.keys()],
          ),
        };
      } catch (error) {
        throw new HardwareWalletError(
          `Failed to verify Trezor PSBT result: ${error instanceof Error ? error.message : 'unknown error'}`,
          'INVALID_HARDWARE_SIGNATURE',
          'trezor',
          'The signed transaction did not exactly match the reviewed PSBT.',
        );
      }
    }

    return { signedTxHex };
  }

  /**
   * Clean up resources and remove event listeners
   */
  async dispose(): Promise<void> {
    if (this.initialized) {
      try {
        await TrezorConnect.dispose();
      } finally {
        this.initialized = false;
        this.connectionStatus = 'disconnected';
        this.deviceInfo = null;
      }
    }
  }

  /**
   * Attempt to reconnect after disconnection.
   *
   * This is useful when the device has been disconnected and needs to be
   * re-initialized. It disposes the current connection and re-initializes.
   *
   * @returns true if reconnection succeeded, false otherwise
   */
  async reconnect(): Promise<boolean> {
    // If already connected, verify the in-memory status with the device.
    if (this.connectionStatus === 'connected') {
      try {
        return await this.pingDevice();
      } catch {
        this.connectionStatus = 'disconnected';
        if (this.deviceInfo) {
          this.deviceInfo.connected = false;
        }
      }
    }

    try {
      // Clean up existing state
      await this.dispose();

      // Re-initialize with stored options
      await this.init(this.options);

      return true;
    } catch (error) {
      // Reconnection failed - log but don't throw
      console.warn('Trezor reconnection failed:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Ensure the adapter is initialized, with optional auto-reconnect
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

  /**
   * Recover from non-user sign failures that can leave the popup/transport session stale.
   * We keep this narrow to avoid retrying after explicit user cancellation.
   */
  private async recoverFromSignFailure(code?: string): Promise<void> {
    if (!this.shouldRecoverFromSignFailure(code) || !this.initialized) {
      return;
    }

    try {
      await this.dispose();
      await this.init(this.options);
    } catch {
      // Re-initialization failure is expected to be surfaced via the existing signing error path
    }
  }

  private shouldRecoverFromSignFailure(code?: string): boolean {
    if (!code) {
      return false;
    }

    // Explicit user cancellations should stay user-facing; avoid reinitialize loops.
    if (code === 'Failure_ActionCancelled') {
      return false;
    }

    const lower = code.toLowerCase();
    return (
      lower.includes('initialize') ||
      lower.includes('initializefailed') ||
      lower.includes('interrupted') ||
      lower.includes('transport') ||
      lower.includes('disconnect') ||
      lower.includes('session')
    );
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
 * Reset the Trezor adapter (for testing, cleanup, or reconnection).
 *
 * This function fully resets the Trezor connection state by:
 * 1. Disposing the adapter instance (removes event listeners)
 * 2. Calling TrezorConnect.dispose() directly to clear any residual state
 * 3. Setting the singleton to null for fresh initialization
 *
 * Call this before retrying a connection after failure or when reconnecting
 * a device to ensure clean state.
 */
export async function resetTrezorAdapter(): Promise<void> {
  if (trezorAdapterInstance) {
    // dispose() already calls TrezorConnect.dispose() internally
    await trezorAdapterInstance.dispose();
    trezorAdapterInstance = null;
  } else {
    // No adapter instance, but TrezorConnect might still have state
    // (e.g., from a failed init or external initialization)
    try {
      await TrezorConnect.dispose();
    } catch {
      // Ignore if already disposed or not initialized
    }
  }
}
