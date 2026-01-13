/**
 * Type declarations for @trezor/connect-webextension
 *
 * This module provides Trezor Connect functionality for browser extensions.
 * The webextension variant is designed to work in service worker contexts.
 */

declare module '@trezor/connect-webextension' {
  // Event types
  export const DEVICE_EVENT = 'DEVICE_EVENT';
  export const UI_EVENT = 'UI_EVENT';
  export const TRANSPORT_EVENT = 'TRANSPORT_EVENT';

  export const DEVICE: {
    CONNECT: 'device-connect';
    DISCONNECT: 'device-disconnect';
    CHANGED: 'device-changed';
    ACQUIRE: 'device-acquire';
    RELEASE: 'device-release';
    ACQUIRED: 'device-acquired';
    RELEASED: 'device-released';
    USED_ELSEWHERE: 'device-used_elsewhere';
    LOADING: 'device-loading';
    BUTTON: 'device-button';
    PIN: 'device-pin';
    PASSPHRASE: 'device-passphrase';
    PASSPHRASE_ON_DEVICE: 'device-passphrase_on_device';
    WORD: 'device-word';
  };

  export const UI: {
    REQUEST_BUTTON: 'ui-request_button';
    REQUEST_PIN: 'ui-request_pin';
    REQUEST_PASSPHRASE: 'ui-request_passphrase';
    REQUEST_PASSPHRASE_ON_DEVICE: 'ui-request_passphrase_on_device';
    REQUEST_CONFIRMATION: 'ui-request_confirmation';
    REQUEST_WORD: 'ui-request_word';
    RECEIVE_CONFIRMATION: 'ui-receive_confirmation';
    RECEIVE_PIN: 'ui-receive_pin';
    RECEIVE_PASSPHRASE: 'ui-receive_passphrase';
    RECEIVE_WORD: 'ui-receive_word';
  };

  // Device features from Trezor
  export interface Features {
    vendor: string;
    major_version: number;
    minor_version: number;
    patch_version: number;
    bootloader_mode: boolean | null;
    device_id: string | null;
    pin_protection: boolean;
    passphrase_protection: boolean;
    language: string;
    label: string | null;
    initialized: boolean;
    revision: string;
    bootloader_hash: string | null;
    imported: boolean | null;
    unlocked: boolean;
    firmware_present: boolean | null;
    needs_backup: boolean;
    flags: number;
    model: string;
    fw_major: number | null;
    fw_minor: number | null;
    fw_patch: number | null;
    fw_vendor: string | null;
    unfinished_backup: boolean;
    no_backup: boolean;
    recovery_mode: boolean;
    capabilities: number[];
    backup_type: number;
    sd_card_present: boolean;
    sd_protection: boolean;
    wipe_code_protection: boolean;
    session_id: string;
    passphrase_always_on_device: boolean;
    safety_checks: string;
    auto_lock_delay_ms: number;
    display_rotation: number;
    experimental_features: boolean;
  }

  // Device payload in events
  export interface DevicePayload {
    type: string;
    id: string | null;
    path: string;
    label: string;
    state: string | null;
    status: string;
    mode: string;
    firmware: string;
    firmwareRelease: object | null;
    unavailableCapabilities: object;
    features?: Features;
  }

  // Event types
  export interface DeviceEvent {
    type: typeof DEVICE.CONNECT | typeof DEVICE.DISCONNECT | typeof DEVICE.CHANGED;
    payload: DevicePayload;
  }

  export interface UIEvent {
    type: string;
    payload?: {
      code?: string;
      device?: DevicePayload;
    };
  }

  // API Response types
  export interface Success<T> {
    success: true;
    payload: T;
  }

  export interface Unsuccessful {
    success: false;
    payload: {
      error: string;
      code?: string;
    };
  }

  export type Response<T> = Success<T> | Unsuccessful;

  // Address result
  export interface AddressResult {
    address: string;
    path: number[] | string;
    serializedPath: string;
    publicKey?: string;
  }

  // Public key result
  export interface PublicKeyResult {
    path: number[] | string;
    serializedPath: string;
    xpub: string;
    xpubSegwit?: string;
    chainCode: string;
    childNum: number;
    publicKey: string;
    fingerprint: number;
    depth: number;
  }

  // Sign message result
  export interface SignMessageResult {
    address: string;
    signature: string;
  }

  // Sign transaction result
  export interface SignTransactionResult {
    signatures: string[];
    serializedTx: string;
    txid?: string;
  }

  // Init configuration
  export interface InitConfig {
    manifest: {
      appName: string;
      email: string;
      appUrl?: string;
    };
    debug?: boolean;
    popup?: boolean;
    transports?: string[];
    pendingTransportEvent?: boolean;
    transportReconnect?: boolean;
    connectSrc?: string;
    lazyLoad?: boolean;
    interactionTimeout?: number;
  }

  // Get address params
  export interface GetAddressParams {
    path: string | number[];
    coin?: string;
    showOnTrezor?: boolean;
    scriptType?: string;
    useEmptyPassphrase?: boolean;
    chunkify?: boolean;
  }

  export interface GetAddressBundleParams {
    bundle: Array<{
      path: string | number[];
      coin?: string;
      showOnTrezor?: boolean;
      scriptType?: string;
    }>;
    useEmptyPassphrase?: boolean;
  }

  // Get public key params
  export interface GetPublicKeyParams {
    path: string | number[];
    coin?: string;
    useEmptyPassphrase?: boolean;
  }

  // Sign message params
  export interface SignMessageParams {
    path: string | number[];
    message: string;
    coin?: string;
    hex?: boolean;
  }

  // Transaction input/output for signing
  export interface TransactionInput {
    address_n?: number[];
    prev_hash: string;
    prev_index: number;
    amount?: string | number;
    script_type?: string;
    sequence?: number;
    script_sig?: string;
  }

  export interface TransactionOutput {
    address_n?: number[];
    address?: string;
    amount: string | number;
    script_type?: string;
    op_return_data?: string;
  }

  export interface RefTransaction {
    hash: string;
    version: number;
    lock_time: number;
    inputs: Array<{
      prev_hash: string;
      prev_index: number;
      script_sig: string;
      sequence: number;
    }>;
    bin_outputs: Array<{
      amount: string | number;
      script_pubkey: string;
    }>;
  }

  // Sign transaction params
  export interface SignTransactionParams {
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
    coin?: string;
    push?: boolean;
    refTxs?: RefTransaction[];
    locktime?: number;
    version?: number;
    expiry?: number;
    overwintered?: boolean;
    versionGroupId?: number;
    branchId?: number;
    timestamp?: number;
  }

  // UI Response
  export interface UIResponse {
    type: string;
    payload: boolean | string | object;
  }

  // Main TrezorConnect interface
  interface TrezorConnect {
    init(config: InitConfig): Promise<void>;
    dispose(): void;

    // Event handling
    on(event: typeof DEVICE_EVENT, callback: (event: DeviceEvent) => void): void;
    on(event: string, callback: (event: UIEvent) => void): void;
    off(event: string, callback: (event: unknown) => void): void;
    removeAllListeners(): void;

    // UI responses
    uiResponse(response: UIResponse): void;

    // Device methods
    getFeatures(): Promise<Response<Features>>;
    getAddress(params: GetAddressParams): Promise<Response<AddressResult>>;
    getAddress(params: GetAddressBundleParams): Promise<Response<AddressResult[]>>;
    getPublicKey(params: GetPublicKeyParams): Promise<Response<PublicKeyResult>>;
    signMessage(params: SignMessageParams): Promise<Response<SignMessageResult>>;
    signTransaction(params: SignTransactionParams): Promise<Response<SignTransactionResult>>;
  }

  const TrezorConnect: TrezorConnect;
  export default TrezorConnect;
}
