import { Wallet } from './walletManager';
import { KeychainSettings } from '@/utils/storage/settingsStorage';

interface Keychain {
  wallets: Wallet[];
  settings: KeychainSettings;
}