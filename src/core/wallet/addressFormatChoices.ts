import { AddressFormat, isCounterwalletFormat, isFreewalletBIP39Format } from '@/core/bitcoin/address';
import type { Wallet } from '@/types/wallet';

/**
 * Which address formats a wallet may be switched between, and whether it may be switched at all.
 *
 * One policy, read by every surface that offers the choice — Settings → Address type and the home
 * header shortcut — so a shortcut can never offer a format the settings page would hide.
 */

const ALL_ADDRESS_FORMATS = Object.values(AddressFormat);

/**
 * The formats offered to a wallet, in display order.
 *
 * A wallet's derivation family is fixed by how it was created: Counterwallet seeds stay within the
 * Counterwallet formats, FreeWallet BIP39 seeds within the FreeWallet formats, and standard BIP39
 * seeds see neither group.
 */
export function selectableAddressFormats(walletFormat: AddressFormat): AddressFormat[] {
  return ALL_ADDRESS_FORMATS.filter((format) => {
    if (isCounterwalletFormat(walletFormat)) return isCounterwalletFormat(format);
    if (isFreewalletBIP39Format(walletFormat)) return isFreewalletBIP39Format(format);
    return !isCounterwalletFormat(format) && !isFreewalletBIP39Format(format);
  });
}

/**
 * Hardware wallets fix their address type when they are connected; changing it means reconnecting
 * the device with another format. Settings shows the choice but disables it.
 */
export function isAddressFormatLocked(wallet: Pick<Wallet, 'type'>): boolean {
  return wallet.type === 'hardware';
}

/**
 * Whether switching could succeed at all. Mirrors the guard in
 * `WalletManager.updateWalletAddressFormat`, which re-derives addresses from the mnemonic and
 * refuses every other wallet type.
 */
export function canSwitchAddressFormat(wallet: Pick<Wallet, 'type'>): boolean {
  return wallet.type === 'mnemonic' && !isAddressFormatLocked(wallet);
}

/**
 * The derivation index a format switch keeps: the active address's index, clamped to the indices
 * the wallet exposes, or 0 when the active address is not one of the wallet's.
 *
 * `WalletManager.updateWalletAddressFormat` lands on this index, and the address-type previews
 * derive at it, so each option shows the address a switch would actually select.
 */
export function addressIndexKeptBySwitch(
  wallet: Pick<Wallet, 'addresses' | 'addressCount'>,
  activeAddress: string | null | undefined
): number {
  const address = wallet.addresses.find((candidate) => candidate.address === activeAddress)
    ?? wallet.addresses[0];
  if (!address) return 0;
  const index = Number(address.path.split('/').at(-1));
  if (!Number.isSafeInteger(index) || index < 0) return 0;
  return Math.min(index, Math.max(wallet.addressCount - 1, 0));
}
