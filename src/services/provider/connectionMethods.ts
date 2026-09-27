/**
 * Connection and permission methods: xcp_requestAccounts (including waiting for wallet setup or
 * unlock), xcp_accounts and xcp_getAddresses, and the connection proof a new or repeated connect
 * returns.
 */

import { type AddressFormat, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { walletSupportsPair } from '@/core/bitcoin/providerSignerScope';
import { CONNECTION_PROOF_PREFIX } from '@/core/connectionProof';
import { generateRequestId } from '@/core/id';
import { providerPsbtSigningCapabilities } from '@/core/providerCapabilities';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { getSessionGeneration } from '@/platform/auth/sessionManager';
import { continuationUnlockPath, openExtensionPopup, reusePopupWindow } from '@/platform/popup';
import type { AuthorizedRequest } from '@/platform/storage/requestStorage';
import { keychainExists } from '@/platform/storage/walletStorage';
import type { ApprovalPlacement } from '@/services/approvalService';
import { getConnectionService } from '@/services/connectionService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { expired, walletLocked } from '@/services/provider/requestErrors';
import type { ProviderMethodContext } from '@/services/provider/requestIntake';
import { assertSignDeliveryAuthorized } from '@/services/signDelivery';
import { getWalletService } from '@/services/walletService';

type ProviderConnectionProof = {
  address: string;
  message: string;
  signature: string;
  verification:
    | { method: 'BIP-322'; format: string }
    | { method: 'BIP-137'; format: 'legacy_recoverable' };
};

type ConnectionProofContext = {
  request: AuthorizedRequest;
  sessionGeneration: number;
  hardware: boolean;
  pairedSupported: boolean;
  format: AddressFormat;
};

/**
 * Call `onClosed` when the user closes a window this request opened for them (unlock or wallet
 * setup), so the site hears 4001 at once instead of waiting out the whole timeout for a window
 * that is gone. Returns the function that stops watching; every exit path must call it.
 */
function watchWindowClosed(windowId: number, onClosed: () => void): () => void {
  const onRemoved = chrome.windows?.onRemoved;
  if (!onRemoved) return () => {};
  const listener = (removedWindowId: number) => {
    if (removedWindowId === windowId) onClosed();
  };
  onRemoved.addListener(listener);
  return () => onRemoved.removeListener(listener);
}

/**
 * Generate a connection proof: auto-sign a deterministic message proving
 * the user controls the address. No user prompt — they already approved connecting.
 * The message format is locked down so it can't be confused with arbitrary signing.
 */
async function generateConnectionProof(
  context: ConnectionProofContext,
  target: { address: string; format: AddressFormat },
): Promise<ProviderConnectionProof | null> {
  try {
    const walletService = getWalletService();

    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const issued = Math.floor(Date.now() / 1000);

    const message = `${CONNECTION_PROOF_PREFIX}origin:${context.request.origin}\nnonce:${nonce}\nissued:${issued}`;

    const result = await walletService.signMessage(
      message,
      target.address,
      { walletId: context.request.walletId, address: context.request.address },
    );

    if (normalizeAddressForComparison(result.address) !== normalizeAddressForComparison(target.address)) {
      throw new Error('Connection proof signed for a different address');
    }

    return {
      address: target.address,
      message,
      signature: result.signature,
      verification: context.hardware
        ? { method: 'BIP-137', format: 'legacy_recoverable' }
        : { method: 'BIP-322', format: target.format },
    };
  } catch (error) {
    console.warn('[ProviderService] Failed to generate connection proof:', error);
    return null;
  }
}

export async function getAccounts(origin: string): Promise<string[]> {
  const walletService = getWalletService();
  const connectionService = getConnectionService();

  const isUnlocked = await walletService.isKeychainUnlocked();
  if (!isUnlocked) return [];

  const activeAddress = await walletService.getActiveAddress();
  if (!activeAddress) return [];

  const isConnected = await connectionService.hasPermission(origin);
  return isConnected ? [activeAddress.address] : [];
}

/** Sign and deliver only the identity and optional sibling grant approved by this connection. */
async function buildConnectResponse(accounts: string[], context: ConnectionProofContext) {
  if (accounts.length !== 1
    || normalizeAddressForComparison(accounts[0]!) !== normalizeAddressForComparison(context.request.address)) {
    throw new Error('The connection identity changed before its proof was generated');
  }
  const { request, sessionGeneration } = context;
  // A connection proof is bound to the exact identity approved; it never continues across the pair.
  const authorize = (paired: boolean) => assertSignDeliveryAuthorized(request, paired, sessionGeneration, false);
  let assertCurrent = await authorize(false);
  assertCurrent();
  const paired = context.pairedSupported && await getConnectionService().hasPairedAddressPermission(
    request.origin, request.walletId, request.address,
  );
  assertCurrent();

  const targets = [{ address: request.address, format: context.format }];
  if (paired) {
    assertCurrent = await authorize(true);
    // getPairedAddresses captures the current wallet synchronously. Check the pinned
    // identity immediately before calling it and again before using the derived pair.
    assertCurrent();
    const addresses = await getWalletService().getPairedAddresses();
    assertCurrent();
    for (const target of [addresses.legacy, addresses.segwit]) {
      if (!targets.some(candidate => normalizeAddressForComparison(candidate.address)
        === normalizeAddressForComparison(target.address))) targets.push(target);
    }
  }

  const proofs: ProviderConnectionProof[] = [];
  let proof: ProviderConnectionProof | null = null;
  for (const [index, target] of targets.entries()) {
    assertCurrent();
    const signed = await generateConnectionProof(context, target);
    assertCurrent();
    if (index === 0) proof = signed;
    if (signed) proofs.push(signed);
  }
  // Device refusal may omit a proof. Locking, switching, or revoking a grant
  // invalidates the entire response, including signatures already produced.
  const assertDelivery = await authorize(paired);
  assertDelivery();
  return { accounts, proof, ...(proofs.length > 1 ? { proofs } : {}) };
}

/**
 * Design note: Paired-address provider capability
 *
 * A connection authorizes only its active address. A dApp may opt in to the
 * active derivation index's Legacy/SegWit sibling pair through explicit
 * approval that displays both addresses before Connect. The grant is bound
 * to origin, wallet ID, and active address, and is removed on disconnect.
 *
 * Signing fails closed before approval storage: requested signer addresses
 * must be the active address or its exact sibling pair, input indices must be
 * unique and in range, each input prevout must match its claimed signer,
 * and paired signing requires the bound capability.
 * This deliberately does not authorize other HD derivation indices.
 *
 * Resolve a connection request: return existing accounts if already connected,
 * otherwise connect and build the response. onBeforeConnect runs only for a
 * new connection (after the already-connected check, before connect).
 */
async function completeConnection(
  origin: string,
  pairedAddresses = false,
  onBeforeConnect?: () => Promise<void>,
  placement: ApprovalPlacement = {}
) {
  const walletService = getWalletService();
  const connectionService = getConnectionService();

  const sessionGeneration = getSessionGeneration();
  const activeAddress = await walletService.getActiveAddress();
  const activeWallet = await walletService.getActiveWallet();
  if (!activeAddress || !activeWallet) {
    throw new Error('No active wallet or address');
  }
  const context: ConnectionProofContext = {
    request: { id: generateRequestId('connect-proof'), origin, timestamp: Date.now(),
      walletId: activeWallet.id, address: activeAddress.address },
    sessionGeneration,
    hardware: activeWallet.type === 'hardware',
    pairedSupported: walletSupportsPair(activeWallet),
    format: activeWallet.addressFormat,
  };
  // A wallet with no sibling pair (Taproot, hardware, a single key) has nothing to grant: asking
  // would show the user an empty pair and leave the site a grant xcp_getAddresses cannot serve.
  // The capability is optional, so the site connects normally without it and reads its absence
  // from xcp_getAddresses.
  const requestPair = pairedAddresses && context.pairedSupported;

  if (await connectionService.hasPermission(origin)) {
    if (requestPair) {
      await connectionService.requestPairedAddressPermission(
        origin,
        activeAddress.address,
        activeWallet.id,
        placement
      );
    }
    return buildConnectResponse(await getAccounts(origin), context);
  }

  await onBeforeConnect?.();

  const accounts = await connectionService.connect(
    origin,
    activeAddress.address,
    activeWallet.id,
    requestPair,
    placement
  );
  return buildConnectResponse(accounts, context);
}

/** xcp_requestAccounts: connect the site, first waiting for wallet setup or unlock if needed. */
export async function requestAccounts(
  { origin, params, walletService }: ProviderMethodContext,
): Promise<unknown> {
  const accountOptions = params?.[0] as {
    capabilities?: { pairedAddresses?: boolean }
  } | undefined;
  const pairedAddresses = accountOptions?.capabilities?.pairedAddresses === true;

  // Check if keychain exists in storage (works even when locked)
  if (!await keychainExists()) {
    // Open popup for wallet setup and wait for onboarding to complete
    const setupWindow = await openExtensionPopup();

    // Wait for wallet creation, then continue with connection flow
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;

      // Centralized cleanup - called on any exit path
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        stopWatchingWindow();
        eventEmitterService.off('wallet-created', handleWalletCreated);
      };

      const handleWalletCreated = async () => {
        if (settled) return;
        settled = true;
        cleanup();

        // Continue with connection flow now that wallet exists
        try {
          resolve(await completeConnection(origin, pairedAddresses));
        } catch (error) {
          reject(error);
        }
      };

      timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Wallet setup timeout - please try again'));
      }, 10 * 60 * 1000); // 10 minute timeout for onboarding

      const stopWatchingWindow = watchWindowClosed(setupWindow.id, () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'User closed the wallet setup window'));
      });
      eventEmitterService.on('wallet-created', handleWalletCreated);
    });
  }

  // Check if wallet is locked
  const isUnlocked = await walletService.isKeychainUnlocked();
  if (!isUnlocked) {
    const requestId = generateRequestId(`${origin}-unlock`);

    // Open the regular popup - it shows the unlock screen. After unlock the connection
    // approval continues in this same window rather than opening a second one; the marked
    // path tells the unlock screen to wait for that instead of going home.
    const unlockWindow = await openExtensionPopup(continuationUnlockPath(requestId));

    // Wait for unlock and then continue with connection
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;

      // Centralized cleanup - called on any exit path
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        stopWatchingWindow();
        eventEmitterService.off('wallet-unlocked', handleUnlock);
      };

      const handleUnlock = async () => {
        if (settled) return;
        settled = true;
        cleanup();

        // Re-check wallet state after unlock
        const nowUnlocked = await walletService.isKeychainUnlocked();
        if (!nowUnlocked) {
          reject(new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Wallet still locked after unlock attempt'));
          return;
        }

        // Continue with connection flow, in the window the user just unlocked
        let continued = false;
        try {
          resolve(await completeConnection(origin, pairedAddresses, undefined, {
            reuseWindowId: unlockWindow.id,
            onReused: () => { continued = true; },
          }));
        } catch (error) {
          reject(error);
        } finally {
          // No approval took the window (already connected, or the flow failed first):
          // release the waiting unlock screen to the home page.
          if (!continued) void reusePopupWindow(unlockWindow.id, '#/index');
        }
      };

      timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(expired('Unlock timeout - please try again'));
      }, 5 * 60 * 1000); // 5 minute timeout

      const stopWatchingWindow = watchWindowClosed(unlockWindow.id, () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'User closed the unlock window'));
      });
      eventEmitterService.on('wallet-unlocked', handleUnlock);
    });
  }

  return await completeConnection(origin, pairedAddresses);
}

/** xcp_getAddresses: the active address, and its Legacy/SegWit pair when the site holds that grant. */
export async function getAddresses({ origin, walletService, connectionService }: ProviderMethodContext) {
  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
  }
  const activeAddress = await walletService.getActiveAddress();
  const activeWallet = await walletService.getActiveWallet();
  if (!activeAddress || !activeWallet) throw walletLocked();
  // A wallet with no sibling pair can still hold a paired grant stored before connect stopped
  // offering the capability to such wallets. It has no pair to serve: return the active
  // address alone rather than failing.
  const paired = walletSupportsPair(activeWallet) && await connectionService.hasPairedAddressPermission(
    origin,
    activeWallet.id,
    activeAddress.address
  );
  const active = {
    address: activeAddress.address,
    publicKey: activeAddress.pubKey,
    type: activeWallet.addressFormat,
  };
  const signing = providerPsbtSigningCapabilities(activeWallet);
  if (!paired) return { active, signing };
  const addresses = await walletService.getPairedAddresses();
  return {
    active,
    signing,
    legacy: {
      address: addresses.legacy.address,
      publicKey: addresses.legacy.pubKey,
      type: addresses.legacy.type,
    },
    segwit: {
      address: addresses.segwit.address,
      publicKey: addresses.segwit.pubKey,
      type: addresses.segwit.type,
    },
  };
}
