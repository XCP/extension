import { Wallet } from './walletManager';
import { KeychainSettings } from '@/utils/storage';

export interface Keychain {
  wallets: Wallet[];
  settings: KeychainSettings;
}