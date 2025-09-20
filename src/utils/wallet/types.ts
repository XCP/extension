import { Wallet } from './walletManager';
import { KeychainSettings } from '@/utils/storage';

interface Keychain {
  wallets: Wallet[];
  settings: KeychainSettings;
}