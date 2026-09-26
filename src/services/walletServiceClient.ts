/**
 * The wallet service as seen from the popup and sidepanel: its name and remote-call policy, and a
 * proxy that forwards calls to the background.
 *
 * Kept apart from walletService.ts so extension pages get the proxy without bundling the
 * implementation (walletManager, keychain, signing). The background registers the real service
 * against this same policy, so the two sides cannot drift. Code that runs in the background keeps
 * using getWalletService() from walletService.ts: this proxy is never registered, so calling it
 * inside the background throws.
 */
import { defineProxyService, type ProxyServicePolicy } from '@/platform/proxy';
import type { WalletService } from '@/services/walletService';

export const WALLET_SERVICE_NAME = 'WalletService';

export const WALLET_SERVICE_POLICY: ProxyServicePolicy<WalletService> = {
  methods: {
    refreshWallets: 'command', getSettings: 'read', updateSettings: 'command',
    // Test fixtures authorize a site with this (e2e/utils/provider-gallery.ts); the extension's own
    // pages grant only through the connection flow.
    addConnectedWebsite: 'command',
    getWallets: 'read', getActiveWallet: 'read', getActiveAddress: 'read',
    unlockKeychain: 'command', selectWallet: 'command', isKeychainUnlocked: 'read',
    lockKeychain: 'command',
    createMnemonicWallet: 'command', createPrivateKeyWallet: 'command', importTestAddress: 'command',
    createHardwareWalletWithDiscovery: 'command', addAddress: 'command', addUtxoAddress: 'command',
    removeUtxoAddress: 'command', sweepUtxoAddresses: 'command', verifyPassword: 'command',
    resetKeychain: 'command', updatePassword: 'command', updateWalletAddressFormat: 'command',
    revealSecret: 'command',
    removeWallet: 'command', getPreviewAddressForFormat: 'read', getPairedAddresses: 'read',
    isAddressInAnyWallet: 'read', signTransaction: 'command', broadcastTransaction: 'command',
    signMessage: 'command', getLastActiveAddress: 'read',
    getKnownScriptRecipients: 'read', recordScriptRecipients: 'command',
    setLastActiveAddress: 'command', setLastActiveTime: 'command', consolidateBareMultisig: 'command',
  },
};

/** A caller-side proxy. It is never registered, so its factory never runs. */
export const [, getWalletServiceClient] = defineProxyService<WalletService>(
  WALLET_SERVICE_NAME,
  () => { throw new Error('WalletService is registered only in the background'); },
  WALLET_SERVICE_POLICY,
);
