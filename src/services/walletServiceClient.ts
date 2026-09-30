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
import { defineProxyClient } from '@/platform/proxy/client';
import type { ProxyServicePolicy } from '@/platform/proxy/protocol';
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
    isAddressInAnyWallet: 'read', signTransaction: 'command', signCommitAndReveal: 'command',
    broadcastTransaction: 'command',
    signMessage: 'command', getLastActiveAddress: 'read',
    recordZeldOutpoints: 'command',
    // Coin control. Offer locks are added only by the background, from what a signature proved.
    getCoinLocks: 'read', updateCoinLocks: 'command',
    setLastActiveAddress: 'command', setLastActiveTime: 'command', consolidateBareMultisig: 'command',
  },
};

/** A caller-side proxy. It has no implementation behind it, so calling it in the background throws. */
export const getWalletServiceClient = defineProxyClient<WalletService>(WALLET_SERVICE_NAME, WALLET_SERVICE_POLICY);
