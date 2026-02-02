/**
 * Type declarations for @trezor/connect-webextension
 *
 * This module provides Trezor Connect functionality for browser extension contexts.
 * These are minimal declarations covering the APIs we use.
 * The actual Trezor Connect API has many more options - these declarations
 * use permissive types to allow extension-specific features.
 */

declare module '@trezor/connect-webextension' {
  // Device events
  export const DEVICE_EVENT = 'DEVICE_EVENT';
  export const DEVICE: {
    CONNECT: 'device-connect';
    DISCONNECT: 'device-disconnect';
    CONNECT_UNACQUIRED: 'device-connect_unacquired';
    CHANGED: 'device-changed';
    ACQUIRE: 'device-acquire';
    RELEASE: 'device-release';
    ACQUIRED: 'device-acquired';
    RELEASED: 'device-released';
    USED_ELSEWHERE: 'device-used_elsewhere';
    LOADING: 'device-loading';
    BUTTON: 'button';
    PIN: 'pin';
    PASSPHRASE: 'passphrase';
    PASSPHRASE_ON_DEVICE: 'passphrase_on_device';
    WORD: 'word';
  };

  // UI events
  export const UI: {
    REQUEST_UI_WINDOW: 'ui-request_ui_window';
    CLOSE_UI_WINDOW: 'ui-close_ui_window';
    REQUEST_PERMISSION: 'ui-request_permission';
    REQUEST_CONFIRMATION: 'ui-request_confirmation';
    REQUEST_PIN: 'ui-request_pin';
    INVALID_PIN: 'ui-invalid_pin';
    REQUEST_PASSPHRASE: 'ui-request_passphrase';
    REQUEST_PASSPHRASE_ON_DEVICE: 'ui-request_passphrase_on_device';
    INVALID_PASSPHRASE: 'ui-invalid_passphrase';
    CONNECT: 'ui-connect';
    LOADING: 'ui-loading';
    SET_OPERATION: 'ui-set_operation';
    SELECT_DEVICE: 'ui-select_device';
    SELECT_ACCOUNT: 'ui-select_account';
    SELECT_FEE: 'ui-select_fee';
    UPDATE_CUSTOM_FEE: 'ui-update_custom_fee';
    INSUFFICIENT_FUNDS: 'ui-insufficient_funds';
    REQUEST_BUTTON: 'ui-button';
    RECEIVE_CONFIRMATION: 'ui-receive_confirmation';
    BOOTLOADER: 'ui-bootloader';
    NOT_IN_BOOTLOADER: 'ui-not_in_bootloader';
    REQUIRE_MODE: 'ui-require_mode';
    INITIALIZE: 'ui-initialize';
    SEEDLESS: 'ui-seedless';
    FIRMWARE_OLD: 'ui-firmware_old';
    FIRMWARE_OUTDATED: 'ui-firmware_outdated';
    FIRMWARE_NOT_SUPPORTED: 'ui-firmware_not_supported';
    FIRMWARE_NOT_COMPATIBLE: 'ui-firmware_not_compatible';
    FIRMWARE_NOT_INSTALLED: 'ui-firmware_not_installed';
    DEVICE_NEEDS_BACKUP: 'ui-device_needs_backup';
    REQUEST_WORD: 'ui-request_word';
    LOGIN_CHALLENGE_REQUEST: 'ui-login_challenge_request';
    BUNDLE_PROGRESS: 'ui-bundle_progress';
    ADDRESS_VALIDATION: 'ui-address_validation';
    FIRMWARE_PROGRESS: 'ui-firmware_progress';
    CUSTOM_MESSAGE_REQUEST: 'ui-custom_message_request';
  };

  export interface Success<T> {
    success: true;
    payload: T;
  }

  export interface Unsuccessful {
    success: false;
    payload: { error: string; code?: string };
  }

  export type Response<T> = Success<T> | Unsuccessful;

  export interface Features {
    vendor: string;
    major_version: number;
    minor_version: number;
    patch_version: number;
    bootloader_mode: boolean | null;
    device_id: string | null;
    pin_protection: boolean;
    passphrase_protection: boolean;
    language: string | null;
    label: string | null;
    initialized: boolean;
    revision: string | null;
    bootloader_hash: string | null;
    imported: boolean | null;
    unlocked: boolean | null;
    firmware_present: boolean | null;
    needs_backup: boolean;
    flags: number;
    model: string;
    fw_major: number | null;
    fw_minor: number | null;
    fw_patch: number | null;
    fw_vendor: string | null;
  }

  export interface Address {
    address: string;
    path: number[];
    serializedPath: string;
  }

  export interface HDNodeResponse {
    path: number[];
    serializedPath: string;
    childNum: number;
    xpub: string;
    xpubSegwit?: string;
    chainCode: string;
    publicKey: string;
    fingerprint: number;
    depth: number;
  }

  export interface SignedTransaction {
    signatures: string[];
    serializedTx: string;
    txid?: string;
  }

  export interface SignedMessage {
    address: string;
    signature: string;
  }

  // Use Record for flexible init config since Trezor has many options
  export interface InitConfig {
    manifest: { email: string; appUrl: string; appName?: string };
    debug?: boolean;
    lazyLoad?: boolean;
    popup?: boolean;
    webusb?: boolean;
    pendingTransportEvent?: boolean;
    connectSrc?: string;
    env?: string;
    transports?: string[];
    transportReconnect?: boolean;
    [key: string]: unknown;
  }

  // Flexible params interfaces
  export interface GetAddressParams {
    path?: string | number[];
    coin?: string;
    showOnTrezor?: boolean;
    crossChain?: boolean;
    multisig?: unknown;
    scriptType?: string;
    useEmptyPassphrase?: boolean;
    bundle?: Array<{ path: string | number[]; showOnTrezor?: boolean; coin?: string; scriptType?: string }>;
    [key: string]: unknown;
  }

  export interface GetPublicKeyParams {
    path: string | number[];
    coin?: string;
    crossChain?: boolean;
    showOnTrezor?: boolean;
    useEmptyPassphrase?: boolean;
    [key: string]: unknown;
  }

  export interface GetAccountInfoParams {
    coin: string;
    path?: string;
    descriptor?: string;
    details?: 'basic' | 'tokens' | 'tokenBalances' | 'txids' | 'txs';
    tokens?: 'nonzero' | 'used' | 'derived';
    page?: number;
    pageSize?: number;
    from?: number;
    to?: number;
    contractFilter?: string;
    gap?: number;
    marker?: { ledger: number; seq: number };
    useEmptyPassphrase?: boolean;
    [key: string]: unknown;
  }

  export interface AccountAddress {
    address: string;
    path: string;
    transfers: number;
    balance: string;
    sent: string;
    received: string;
  }

  export interface AccountInfo {
    path: string;
    descriptor: string;
    balance: string;
    availableBalance: string;
    empty: boolean;
    addresses?: {
      unused?: AccountAddress[];
      used?: AccountAddress[];
      change?: AccountAddress[];
    };
    history?: {
      total: number;
      unconfirmed: number;
    };
    page?: {
      index: number;
      size: number;
      total: number;
    };
    misc?: {
      [key: string]: unknown;
    };
  }

  export interface TrezorConnect {
    init(settings: InitConfig): Promise<void>;

    dispose(): Promise<void>;

    getFeatures(): Promise<Response<Features>>;

    getAddress(params: GetAddressParams): Promise<Response<Address | Address[]>>;

    getPublicKey(params: GetPublicKeyParams): Promise<Response<HDNodeResponse>>;

    getAccountInfo(params: GetAccountInfoParams): Promise<Response<AccountInfo>>;

    signTransaction(params: {
      inputs: Array<{
        address_n: number[];
        prev_hash: string;
        prev_index: number;
        amount: string;
        script_type?: string;
      }>;
      outputs: Array<{
        address?: string;
        address_n?: number[];
        amount: string;
        script_type?: string;
      }>;
      coin: string;
      version?: number;
      locktime?: number;
      serialize?: boolean;
      push?: boolean;
    }): Promise<Response<SignedTransaction>>;

    signMessage(params: {
      path: string | number[];
      message: string;
      coin?: string;
      hex?: boolean;
    }): Promise<Response<SignedMessage>>;

    uiResponse(response: { type: string; payload: unknown }): void;

    on(event: string, callback: (event: unknown) => void): void;
    off(event: string, callback: (event: unknown) => void): void;
    removeAllListeners(): void;
  }

  const TrezorConnect: TrezorConnect;
  export default TrezorConnect;
}
