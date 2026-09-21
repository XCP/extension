import { t } from '@/i18n';

/** Translate canonical default names only at the display boundary. Never persist this value. */
export function displayAccountName(name: string): string {
  const match = /^(Wallet|Address|UTXO Address) ([0-9]+)$/.exec(name);
  // `$` also matches before a final newline; custom names must match in full.
  if (!match || match[0] !== name) return name;
  const number = match[2]!;
  switch (match[1]) {
    case 'Wallet': return t('default_wallet_name', [number]);
    case 'Address': return t('default_address_name', [number]);
    case 'UTXO Address': return t('default_utxo_address_name', [number]);
    default: return name;
  }
}
