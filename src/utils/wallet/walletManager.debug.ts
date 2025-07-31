// Temporary debug version of walletManager to help diagnose test issues
// This adds console.debug statements throughout the wallet creation flow

import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import * as sessionManager from '@/utils/auth/sessionManager';
import { settingsManager } from '@/utils/wallet';
import { getAllEncryptedWallets, addEncryptedWallet, updateEncryptedWallet, removeEncryptedWallet, EncryptedWalletRecord } from '@/utils/storage/walletStorage';
import { encryptMnemonic, decryptMnemonic, encryptPrivateKey, decryptPrivateKey, DecryptionError } from '@/utils/encryption';
import { AddressType, getAddressFromMnemonic, getPrivateKeyFromMnemonic, getAddressFromPrivateKey, getPublicKeyFromPrivateKey, decodeWIF, isWIF, getDerivationPathForAddressType } from '@/utils/blockchain/bitcoin';
import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';
import { KeychainSettings } from '@/utils/storage/settingsStorage';
import { signTransaction as btcSignTransaction } from '@/utils/blockchain/bitcoin/transactionSigner';
import { broadcastTransaction as btcBroadcastTransaction } from '@/utils/blockchain/bitcoin/transactionBroadcaster';

// Re-export the original wallet manager but with debug logging added to createMnemonicWallet
export { WalletManager as OriginalWalletManager } from './walletManager';

// Add debug logging to specific methods
const addDebugToCreateMnemonicWallet = () => {
  console.debug('[WalletManager Debug] Adding debug logging to wallet creation...');
  
  // We'll intercept calls in the service layer instead
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  
  // Override console methods to capture more details
  console.error = (...args) => {
    console.debug('[WalletManager Debug] Error captured:', ...args);
    originalConsoleError(...args);
  };
  
  console.log = (...args) => {
    if (args.some(arg => typeof arg === 'string' && (
      arg.includes('wallet') || 
      arg.includes('Wallet') || 
      arg.includes('encrypt') ||
      arg.includes('storage')
    ))) {
      console.debug('[WalletManager Debug] Log captured:', ...args);
    }
    originalConsoleLog(...args);
  };
};

// Call this when tests start
if (typeof window !== 'undefined' && window.location.href.includes('chrome-extension://')) {
  console.debug('[WalletManager Debug] Extension environment detected, enabling debug mode');
  addDebugToCreateMnemonicWallet();
}