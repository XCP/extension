import { AddressFormat } from '@/core/bitcoin/address';

const LEGACY_FORMATS: ReadonlySet<AddressFormat> = new Set([
  AddressFormat.P2PKH,
  AddressFormat.Counterwallet,
  AddressFormat.FreewalletBIP39,
]);

/** Legacy software wallets must hunt over signatures; other supported formats hunt before review. */
export function huntsWhileSigning(addressFormat: AddressFormat, walletType: 'mnemonic' | 'privateKey' | 'hardware'): boolean {
  return walletType !== 'hardware' && LEGACY_FORMATS.has(addressFormat);
}

export const HUNTS_WHILE_SIGNING = 'A legacy transaction hunts while it is signed.';
