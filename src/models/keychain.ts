import { Wallet } from '@/utils/wallet';
import { KeychainSettings } from '@/utils/storage';

export interface Keychain {
  wallets: Wallet[];
  settings: KeychainSettings;
}
