import { Wallet } from './walletManager';
import { AppSettings } from '@/utils/storage/settingsStorage';

interface Keychain {
  wallets: Wallet[];
  settings: AppSettings;
}
