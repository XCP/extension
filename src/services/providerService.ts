/**
 * ProviderService - Web3 Provider API
 *
 * Main interface for dApp integration, working with:
 * - ConnectionService: Permission and connection management
 * - ApprovalService: User approval workflows
 * - WalletService: Wallet state and cryptographic operations
 */

import { normalizeAddressForComparison, sameAddress } from '@/core/bitcoin/address';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { parseCancelOffersIntent } from '@/core/bitcoin/offerCancellation';
import { parseBitcoinPaymentIntent } from '@/core/bitcoin/providerPayment';
import {
  checkSignInputOwners,
  hasAuthenticatedFunding,
  hasExcessSighashEntries,
  missingSighashEntries,
  psbtHeaderProblem,
  psbtSigningRequestShape,
  usesSingleWithoutOutput,
} from '@/core/bitcoin/providerPsbtIntake';
import { signerScope, walletSupportsPair } from '@/core/bitcoin/providerSignerScope';
import { resolveProviderSignInputs } from '@/core/bitcoin/providerSigningPlan';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { CONNECTION_PROOF_PREFIX } from '@/core/connectionProof';
import { fetchTokenBalance } from '@/core/counterparty/api';
import { getCounterpartyFeatureStatus } from '@/core/counterparty/capabilities';
import { isRevealIntentClaim, parseCommitRevealIntents } from '@/core/counterparty/commitRevealBundle';
import { parseMarketplaceIntent } from '@/core/counterparty/marketplace/intentParser';
import { parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import { parseAcceptanceCpfpBundleIntents } from '@/core/counterparty/marketplaceBundle';
import { MAX_POLICY_ALTERNATIVES } from '@/core/counterparty/policyOffer';
import { generateRequestId } from '@/core/id';
import { isRecord } from '@/core/isRecord';
import {
  assertProviderPsbtSigningRequest,
  providerMessageSigningCapabilities,
  providerPsbtSigningCapabilities,
  unsupportedMarketplaceActionReason,
} from '@/core/providerCapabilities';
import { checkReplayAttempt, markTransactionBroadcasted, markTransactionFailed, recordTransaction } from '@/core/replayPrevention';
import { APPROVAL_WINDOW_FAILED_MESSAGE, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { getSessionGeneration } from '@/platform/auth/sessionManager';
import { analytics } from '@/platform/fathom';
import { continuationUnlockPath, openExtensionPopup, reusePopupWindow } from '@/platform/popup';
import { rememberSuccessfulBroadcast } from '@/platform/provider/recentBroadcasts';
import { beginSignFlow, findSafeChangeSigningAddress } from '@/platform/provider/signFlow';
import { defineProxyServer } from '@/platform/proxy/server';
import type { AuthorizedRequest } from '@/platform/storage/requestStorage';
import { keychainExists } from '@/platform/storage/walletStorage';
import type { ApprovalPlacement } from '@/services/approvalService';
import { type ConnectionService, getConnectionService } from '@/services/connectionService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { assertRequestAdmissible, expired, invalidParams } from '@/services/provider/requestIntake';
import { runSignFlow } from '@/services/provider/signApproval';
import { PROVIDER_SERVICE_NAME, PROVIDER_SERVICE_POLICY } from '@/services/providerServiceClient';
import { assertSignDeliveryAuthorized } from '@/services/signDelivery';
import { getWalletService, type WalletService } from '@/services/walletService';
import type { PairedAddresses, Wallet } from '@/types/wallet';

// Define proper types for provider requests and responses
export type ProviderRequestParams = unknown[];
export type ProviderResponse = unknown;

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

export interface ProviderService {
  /**
   * Handle provider requests from dApps
   */
  handleRequest: (origin: string, method: string, params?: ProviderRequestParams) => Promise<ProviderResponse>;

  /**
   * Disconnect an origin (the connected-sites settings page)
   */
  disconnect: (origin: string) => Promise<void>;
}

/**
 * Connected, but the wallet has no active address to act for: it is locked (a locked wallet keeps
 * its identity and drops its addresses) or not set up. The contract's 4100, so a site prompts the
 * user to unlock instead of treating it as an internal failure.
 */
const walletLocked = () => new ProviderError(
  PROVIDER_ERROR_CODES.UNAUTHORIZED,
  'Wallet is locked or not set up. Unlock XCP Wallet and try again.',
);

/**
 * Whether this wallet can sign a `commit-and-reveal` bundle now: a software wallet with a Native
 * SegWit or Taproot address, against a Counterparty API that attributes a Taproot reveal to the key
 * that signed it (11.5 or newer). An API whose version cannot be read counts as no.
 */
async function signsTaprootReveals(wallet: Pick<Wallet, 'type' | 'addressFormat'>): Promise<boolean> {
  if (wallet.type === 'hardware') return false;
  if (wallet.addressFormat !== AddressFormat.P2WPKH && wallet.addressFormat !== AddressFormat.P2TR) return false;
  try {
    return (await getCounterpartyFeatureStatus('taprootReveals')).supported;
  } catch {
    return false;
  }
}

/**
 * Run a validator over what the site sent and report its refusal as -32602. The wallet's own
 * validators (intent parsers, signing-request checks) throw plain Errors whose fixed text names
 * the problem in terms of the request, so that text is surfaced. Only a plain Error is converted:
 * a ProviderError keeps its own code, and anything else (a TypeError from a bug, a library's own
 * error class) stays masked as -32603 so its text never reaches the site.
 */
function asInvalidParams<T>(validate: () => T, prefix = ''): T {
  try {
    return validate();
  } catch (error) {
    if (error instanceof Error && error.constructor === Error) throw invalidParams(`${prefix}${error.message}`);
    throw error;
  }
}

/**
 * Parse a site's PSBT. The parser's own errors carry library internals, so any failure is reported
 * with one fixed message instead.
 */
function parseSitePsbt(psbtHex: string, prefix = ''): ReturnType<typeof extractPsbtDetails> {
  try {
    return extractPsbtDetails(psbtHex);
  } catch {
    throw invalidParams(`${prefix}PSBT could not be parsed`);
  }
}

/** The active address's Legacy/SegWit pair, loaded only for a wallet that can derive one. */
async function loadPairedAddresses(
  walletService: Pick<WalletService, 'getPairedAddresses'>,
  wallet: { type: string; addressFormat: AddressFormat },
): Promise<PairedAddresses | null> {
  return walletSupportsPair(wallet) ? await walletService.getPairedAddresses() : null;
}

/** Refuse (4100) a request that signs with a paired sibling the site was never granted. */
async function assertPairedAddressGrant(
  connectionService: Pick<ConnectionService, 'hasPairedAddressPermission'>,
  origin: string,
  identity: { walletId: string; address: string },
): Promise<void> {
  if (!await connectionService.hasPairedAddressPermission(origin, identity.walletId, identity.address)) {
    throw new ProviderError(
      PROVIDER_ERROR_CODES.UNAUTHORIZED,
      'Paired Legacy/SegWit address access has not been granted',
    );
  }
}

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


export function createProviderService(): ProviderService {
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

  async function getAccounts(origin: string): Promise<string[]> {
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

  /**
   * Whether `xcp_requestAccounts` would answer without opening any window: the wallet exists and is
   * unlocked, the site is already connected, the active wallet signs its connection proof without a
   * device, and no paired-address access is being asked for. A site re-checking its connection on
   * every page load then never spends the per-origin connect limit, which exists to stop prompts.
   */
  async function connectsSilently(origin: string, params: ProviderRequestParams): Promise<boolean> {
    const options = params?.[0] as { capabilities?: { pairedAddresses?: boolean } } | undefined;
    if (options?.capabilities?.pairedAddresses === true) return false;
    try {
      const walletService = getWalletService();
      if (!await keychainExists() || !await walletService.isKeychainUnlocked()) return false;
      if ((await walletService.getActiveWallet())?.type === 'hardware') return false;
      return await getConnectionService().hasPermission(origin);
    } catch {
      return false;
    }
  }

  /**
   * Handle provider requests from dApps
   */
  async function handleRequest(origin: string, method: string, params: ProviderRequestParams = []): Promise<ProviderResponse> {
    try {
      await assertRequestAdmissible(origin, method, params, {
        silentConnect: method === 'xcp_requestAccounts' && await connectsSilently(origin, params),
      });
      
      // Get services
      const walletService = getWalletService();
      const connectionService = getConnectionService();
      
      switch (method) {
        // ==================== Connection Methods ====================
        
        case 'xcp_requestAccounts': {
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
        
        case 'xcp_accounts': {
          return await getAccounts(origin);
        }
        
        case 'xcp_getAddresses': {
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
          const signing = {
            ...providerPsbtSigningCapabilities(activeWallet, {
              taprootReveals: await signsTaprootReveals(activeWallet),
            }),
            message: providerMessageSigningCapabilities(),
          };
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

        case 'xcp_chainId': {
          return '0x0'; // Bitcoin mainnet
        }
        
        case 'xcp_getNetwork': {
          return 'mainnet'; // Bitcoin mainnet
        }
        
        case 'xcp_disconnect': {
          await connectionService.disconnect(origin);
          return true;
        }
        
        // ==================== Signing Methods ====================
        
        case 'xcp_signMessage': {
          const message = params?.[0];
          const address = params?.[1];
          const options = params?.[2];
          const cancelOffersIntent = parseCancelOffersIntent(isRecord(options) && 'intent' in options ? options.intent : options);

          // Validate message type and presence
          if (!message) {
            throw invalidParams('Message is required');
          }
          if (typeof message !== 'string') {
            throw invalidParams('Message must be a string');
          }
          if (message.startsWith(CONNECTION_PROOF_PREFIX)) {
            throw invalidParams('Messages in the connection-proof namespace are reserved');
          }

          // Validate address type if provided
          if (address !== undefined && typeof address !== 'string') {
            throw invalidParams('Address must be a string');
          }

          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }

          // Get active address/wallet for the request
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) {
            throw walletLocked();
          }

          let signingAddress = activeAddress.address;
          if (
            address
            && normalizeAddressForComparison(address) !== normalizeAddressForComparison(activeAddress.address)
          ) {
            const paired = await loadPairedAddresses(walletService, activeWallet);
            const target = signerScope(activeAddress.address, paired).findPairedTarget(address);
            if (!target) {
              throw invalidParams('Specified address is not the active address or its paired sibling');
            }
            await assertPairedAddressGrant(
              connectionService, origin, { walletId: activeWallet.id, address: activeAddress.address });
            signingAddress = target.address;
          }

          return await runSignFlow({
            origin,
            method,
            params: { message, signingAddress, ...(cancelOffersIntent ? { cancelOffersIntent } : {}) },
            identity: { walletId: activeWallet.id, address: activeAddress.address },
            pairedAddresses: signingAddress !== activeAddress.address,
            approval: {
              eventPrefix: 'sign-message',
              analyticsEvent: 'message_signed',
              cancelMessage: 'User cancelled sign message request',
              timeoutMessage: 'Sign message request timeout',
              mapResult: (result) => result.signature,
            },
            create: async (requestId, requestKey) => {
              // Binds the request to the authorized address/wallet so signing
              // can't later use a different identity.
              await beginSignFlow({
                id: requestId,
                origin,
                requestKey,
                kind: 'sign-message',
                message,
                ...(cancelOffersIntent ? { cancelOffersIntent } : {}),
                address: activeAddress.address,
                signingAddress,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              });
            },
            approvalRoute: '#/requests/message/approve',
          });
        }
        
        case 'xcp_signTransaction': {
          const txParams = params?.[0] as { hex?: string } | string | undefined;

          // Support both { hex: "..." } object and plain string
          const rawTxHex = typeof txParams === 'string' ? txParams : txParams?.hex;

          if (!rawTxHex) {
            throw invalidParams('Transaction hex is required');
          }
          // Checked here, before the grant, the sign-popup limiter and the flow, as the other
          // signing methods check their params: a mistyped hex is the site's error to hear as such.
          if (typeof rawTxHex !== 'string') {
            throw invalidParams('Transaction hex must be a string');
          }

          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }

          // Get active address/wallet for the request
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) {
            throw walletLocked();
          }

          return await runSignFlow({
            origin,
            method,
            params: { rawTxHex },
            identity: { walletId: activeWallet.id, address: activeAddress.address },
            approval: {
              eventPrefix: 'sign-tx',
              analyticsEvent: 'transaction_signed',
              cancelMessage: 'User cancelled transaction signing request',
              timeoutMessage: 'Transaction signing request timeout',
              mapResult: (result) => ({ hex: result.signedTxHex }),
            },
            create: async (requestId, requestKey) => {
              // Binds the request to the authorized address/wallet so signing
              // can't later use a different identity.
              await beginSignFlow({
                id: requestId,
                origin,
                requestKey,
                kind: 'sign-transaction',
                rawTxHex,
                address: activeAddress.address,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              });
            },
            approvalRoute: '#/requests/transaction/approve',
          });
        }

        case 'xcp_signPsbts': {
          const bundleParams = params?.[0];
          if (!bundleParams || typeof bundleParams !== 'object' || Array.isArray(bundleParams)) {
            throw invalidParams('PSBT bundle parameters must be an object with requests');
          }
          const requests = (bundleParams as { requests?: unknown }).requests;
          // Each phase kind bounds its own count below (maxMarketplaceBatchRequests): 8, or 100
          // alternatives of one policy-offer funding set.
          if (!Array.isArray(requests) || requests.length < 1 || requests.length > MAX_POLICY_ALTERNATIVES) {
            throw invalidParams(`This wallet version supports 1..${MAX_POLICY_ALTERNATIVES} linked PSBT requests`);
          }
          const parsedRequests = requests.map((request, requestIndex) => {
            if (!request || typeof request !== 'object' || Array.isArray(request)) {
              throw invalidParams(`PSBT bundle request ${requestIndex} must be an object`);
            }
            const candidate = request as {
              hex?: unknown;
              signInputs?: unknown;
              sighashTypes?: unknown;
              intent?: unknown;
            };
            if (typeof candidate.hex !== 'string' || candidate.hex.length === 0) {
              throw invalidParams(`PSBT bundle request ${requestIndex} requires hex`);
            }
            if (
              !candidate.signInputs
              || typeof candidate.signInputs !== 'object'
              || Array.isArray(candidate.signInputs)
              || Object.keys(candidate.signInputs).length === 0
            ) {
              throw invalidParams(`PSBT bundle request ${requestIndex} requires explicit signInputs`);
            }
            // DEFAULT (0x00) is the Taproot form of ALL, which a policy offer's P2TR bidder signs
            // with. Each family's proof still names the exact sighash it admits per input.
            if (
              !Array.isArray(candidate.sighashTypes)
              || candidate.sighashTypes.some(value => ![0x00, 0x01, 0x83].includes(value as number))
            ) {
              throw invalidParams(
                `PSBT bundle request ${requestIndex} supports only DEFAULT, ALL, or SINGLE|ANYONECANPAY`,
              );
            }
            return {
              psbtHex: candidate.hex,
              signInputs: candidate.signInputs as Record<string, number[]>,
              sighashTypes: candidate.sighashTypes as number[],
              intent: candidate.intent,
            };
          });
          const firstIntent = parsedRequests[0]!.intent;
          const exactCpfp = requests.length === 2
            && firstIntent !== null
            && typeof firstIntent === 'object'
            && !Array.isArray(firstIntent)
            && (firstIntent as { action?: unknown }).action === 'accept_exact_offer';
          // A Taproot-encoded message's commit and its unsigned reveal, recognized by the reveal's claim.
          const commitAndReveal = requests.length === 2 && isRevealIntentClaim(parsedRequests[1]!.intent);
          // The intents are the site's claims; a malformed one, or a bundle over its phase's limit, is
          // the site's error (-32602) with the parser's reason.
          const parsedBundle = asInvalidParams(() => exactCpfp
            ? (() => {
                const pair = parseAcceptanceCpfpBundleIntents(
                  parsedRequests[0]!.intent,
                  parsedRequests[1]!.intent,
                );
                return {
                  kind: 'acceptance-cpfp' as const,
                  intents: [pair.parent, pair.child],
                };
              })()
            : commitAndReveal
              ? (() => {
                  const pair = parseCommitRevealIntents(parsedRequests[0]!.intent, parsedRequests[1]!.intent);
                  return { kind: 'commit-and-reveal' as const, intents: [pair.commit, pair.reveal] };
                })()
              : parseMarketplaceBatchIntents(parsedRequests.map(request => request.intent)));

          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(
              PROVIDER_ERROR_CODES.UNAUTHORIZED,
              'Unauthorized - not connected to wallet',
            );
          }
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) throw walletLocked();

          const scope = signerScope(
            activeAddress.address, await loadPairedAddresses(walletService, activeWallet));
          const signing = providerPsbtSigningCapabilities(activeWallet).psbtBatch;
          // Advertised only where it can succeed; a site that sends it anyway is refused here.
          if (parsedBundle.kind === 'commit-and-reveal' && !await signsTaprootReveals(activeWallet)) {
            throw invalidParams(activeWallet.type === 'hardware'
              ? 'The active wallet cannot sign a Taproot reveal: use a software wallet'
              : 'commit-and-reveal needs a Native SegWit or Taproot address and a Counterparty API at 11.5 or newer');
          }
          for (const bundleIntent of parsedBundle.intents) {
            const unsupported = unsupportedMarketplaceActionReason(signing, bundleIntent.action);
            if (unsupported) throw invalidParams(unsupported);
          }
          let usesPairedAddress = false;

          for (const [requestIndex, request] of parsedRequests.entries()) {
            const details = parseSitePsbt(request.psbtHex, `PSBT bundle request ${requestIndex}: `);
            const marketplaceIntent = parsedBundle.intents[requestIndex]!;
            const headerProblem = psbtHeaderProblem(marketplaceIntent, details);
            if (headerProblem) {
              throw invalidParams(`PSBT bundle request ${requestIndex}: ${headerProblem}`);
            }
            if (!hasAuthenticatedFunding(details, {
              nullBuyerPlaceholder: marketplaceIntent.action === 'create_listing',
            })) {
              throw invalidParams(
                `PSBT bundle request ${requestIndex} must be fully funded with authenticated prevouts`,
              );
            }
            if (hasExcessSighashEntries(request.sighashTypes, details)) {
              throw invalidParams(`PSBT bundle request ${requestIndex} has too many sighash entries`);
            }
            // The reveal spends a commit output no one owns yet, through a leaf closed by the
            // signer's key: its signer is the active address, on input 0 alone, DEFAULT or ALL.
            // The review proves the leaf, its key and the output it spends.
            if (parsedBundle.kind === 'commit-and-reveal' && requestIndex === 1) {
              const signers = Object.entries(request.signInputs);
              if (
                details.inputs.length !== 1
                || details.inputs[0]!.tapLeafScripts?.length !== 1
                || signers.length !== 1
                || !sameAddress(signers[0]![0], activeAddress.address)
                || signers[0]![1].length !== 1 || signers[0]![1][0] !== 0
                || request.sighashTypes.length !== 1
                || (request.sighashTypes[0] !== 0x00 && request.sighashTypes[0] !== 0x01)
              ) {
                throw invalidParams(
                  'PSBT bundle request 1 must be the reveal: one input carrying the envelope leaf, signed by the active address on input 0 with SIGHASH_DEFAULT or SIGHASH_ALL',
                );
              }
              continue;
            }
            if (usesSingleWithoutOutput(request.sighashTypes, details)) {
              throw invalidParams(
                `PSBT bundle request ${requestIndex} uses SINGLE without a paired output`,
              );
            }
            const validation = checkSignInputOwners(request.signInputs, scope.allowed, details);
            if (!validation.valid) {
              throw invalidParams(`PSBT bundle request ${requestIndex}: ${validation.error}`);
            }
            const requestedInputIndices = Object.values(request.signInputs).flat();
            const missing = missingSighashEntries(requestedInputIndices, request.sighashTypes);
            if (missing.length > 0) {
              throw invalidParams(
                `PSBT bundle request ${requestIndex} is missing absolute sighash entries for inputs: ${missing.join(', ')}`,
              );
            }
            asInvalidParams(() => assertProviderPsbtSigningRequest(
              signing,
              psbtSigningRequestShape(details, requestedInputIndices, request.sighashTypes),
            ), `PSBT bundle request ${requestIndex}: `);
            usesPairedAddress ||= scope.usesPairedSigner(request.signInputs);
          }
          if (usesPairedAddress) {
            await assertPairedAddressGrant(
              connectionService, origin, { walletId: activeWallet.id, address: activeAddress.address });
          }

          return await runSignFlow({
            origin,
            method,
            params: { requests: parsedRequests, bundle: parsedBundle },
            identity: { walletId: activeWallet.id, address: activeAddress.address },
            pairedAddresses: usesPairedAddress,
            approval: {
              eventPrefix: 'sign-psbts',
              analyticsEvent: 'psbt_bundle_signed',
              cancelMessage: 'User cancelled PSBT bundle signing request',
              timeoutMessage: 'PSBT bundle signing request timeout',
              mapResult: result => ({ hexes: result.signedPsbtHexes }),
            },
            create: async (requestId, requestKey) => {
              await beginSignFlow({
                id: requestId,
                origin,
                requestKey,
                kind: 'sign-psbts',
                bundleKind: parsedBundle.kind,
                items: parsedRequests.map((request, index) => ({
                  psbtHex: request.psbtHex,
                  signInputs: request.signInputs,
                  sighashTypes: request.sighashTypes,
                  marketplaceIntent: parsedBundle.intents[index]!,
                })),
                address: activeAddress.address,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              });
            },
            approvalRoute: '#/requests/psbts/approve',
          });
        }

        case 'xcp_signPsbt':
        case 'xcp_signBitcoinPsbt': {
          const isBitcoinPayment = method === 'xcp_signBitcoinPsbt';
          const psbtParams = params?.[0];

          // Validate params structure
          if (!psbtParams || typeof psbtParams !== 'object') {
            throw invalidParams('PSBT parameters must be an object with hex property');
          }

          const { hex: psbtHex, signInputs: requestedSignInputs, sighashTypes, inscription, intent } = psbtParams as {
            hex?: string;
            signInputs?: Record<string, number[]>;
            sighashTypes?: number[];
            inscription?: { revealScript?: string; tapInternalKey?: string };
            intent?: unknown;
          };
          let signInputs = requestedSignInputs;

          // A site-signed reveal proves nothing under Core 11.5, which publishes a reveal's message
          // only when the source address's key signed it; the site sends the unsigned reveal in a
          // commit-and-reveal bundle for the wallet to sign instead.
          if ('reveal' in psbtParams) {
            throw invalidParams(
              'The reveal parameter is no longer supported: send the commit and its unsigned reveal as a commit-and-reveal bundle with xcp_signPsbts'
            );
          }
          if (!psbtHex) {
            throw invalidParams('PSBT hex is required');
          }
          if (typeof psbtHex !== 'string') {
            throw invalidParams('PSBT hex must be a string');
          }
          // The intent is the site's claim, checked here with the rest of the request's shape (every
          // signing method validates what it can without the wallet before the grant). A malformed
          // one is the site's error, -32602 with the parser's reason.
          const bitcoinPaymentIntent = isBitcoinPayment
            ? asInvalidParams(() => parseBitcoinPaymentIntent(intent))
            : undefined;
          const marketplaceIntent = !isBitcoinPayment && intent !== undefined
            ? asInvalidParams(() => parseMarketplaceIntent(intent))
            : undefined;
          // Its funding inputs must be proven confirmed once for the whole funding set, which only
          // the linked review does; a lone parent would also hide its sibling alternatives.
          if (marketplaceIntent?.action === 'fund_policy_offer') {
            throw invalidParams('fund_policy_offer must be requested through xcp_signPsbts');
          }
          if (isBitcoinPayment && inscription !== undefined) {
            throw invalidParams('Plain Bitcoin payment requests cannot carry inscription context');
          }
          // Shape-checked here, verified on the approval screen: the context is a claim the site
          // makes about what the commit funds, and every field of it gets recomputed there.
          if (inscription !== undefined && (
            inscription === null || typeof inscription !== 'object'
            || typeof inscription.revealScript !== 'string'
            || typeof inscription.tapInternalKey !== 'string'
            || !/^[0-9a-fA-F]+$/.test(inscription.revealScript)
            || !/^[0-9a-fA-F]{64}$/.test(inscription.tapInternalKey)
          )) {
            throw invalidParams('inscription must carry revealScript and tapInternalKey as hex strings');
          }
          if (signInputs !== undefined && (
            signInputs === null || typeof signInputs !== 'object' || Array.isArray(signInputs)
          )) {
            throw invalidParams('signInputs must be an address-to-input-indices object');
          }
          if (isBitcoinPayment && (!signInputs || Object.keys(signInputs).length === 0)) {
            throw invalidParams('Plain Bitcoin payment requests require explicit signInputs');
          }
          if (sighashTypes !== undefined) {
            if (!Array.isArray(sighashTypes) || sighashTypes.some(
              value => !(isBitcoinPayment ? [0x01] : [0x00, 0x01, 0x81, 0x83]).includes(value)
            )) {
              throw invalidParams(isBitcoinPayment
                ? 'Plain Bitcoin payment requests support only SIGHASH_ALL'
                : 'Only SIGHASH_ALL, ALL|ANYONECANPAY, and SINGLE|ANYONECANPAY are supported');
            }
          }
          if (isBitcoinPayment && sighashTypes === undefined) {
            throw invalidParams('Plain Bitcoin payment requests require explicit SIGHASH_ALL entries');
          }

          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }

          // Get active address/wallet for the request
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) {
            throw walletLocked();
          }

          const psbtDetails = parseSitePsbt(psbtHex);
          // The explicit entries are checked against the PSBT first, so these reasons are the ones a
          // site hears; resolveProviderSignInputs below also covers sighashes embedded in the PSBT.
          if (sighashTypes && hasExcessSighashEntries(sighashTypes, psbtDetails)) {
            throw invalidParams('sighashTypes contains more entries than the PSBT has inputs');
          }
          if (sighashTypes && usesSingleWithoutOutput(sighashTypes, psbtDetails)) {
            throw invalidParams('SIGHASH_SINGLE requires an output at the same index');
          }
          if (activeWallet.type === 'hardware' && signInputs === undefined) {
            throw invalidParams('The active wallet requires PSBT inputs to be selected explicitly');
          }
          signInputs = asInvalidParams(() =>
            resolveProviderSignInputs(psbtDetails, activeAddress.address, signInputs, sighashTypes));
          const requestedInputIndices = signInputs === undefined
            ? undefined
            : Object.values(signInputs).flat();
          const unsupportedAction = unsupportedMarketplaceActionReason(
            providerPsbtSigningCapabilities(activeWallet).psbt,
            marketplaceIntent?.action,
          );
          if (unsupportedAction) throw invalidParams(unsupportedAction);
          asInvalidParams(() => assertProviderPsbtSigningRequest(
            providerPsbtSigningCapabilities(activeWallet).psbt,
            psbtSigningRequestShape(psbtDetails, requestedInputIndices, sighashTypes),
          ));
          if (marketplaceIntent) {
            const headerProblem = psbtHeaderProblem(marketplaceIntent, psbtDetails);
            if (headerProblem) throw invalidParams(headerProblem);
          }
          if (isBitcoinPayment && !hasAuthenticatedFunding(psbtDetails)) {
            throw invalidParams(
              'Plain Bitcoin payment requests must be fully funded with authenticated prevout amounts before review'
            );
          }

          if (signInputs !== undefined) {
            const scope = signerScope(
              activeAddress.address, await loadPairedAddresses(walletService, activeWallet));
            const validation = checkSignInputOwners(signInputs, scope.allowed, psbtDetails);
            if (!validation.valid) throw invalidParams(validation.error ?? 'Invalid signInputs');
            if (scope.usesPairedSigner(signInputs)) {
              await assertPairedAddressGrant(
                connectionService, origin, { walletId: activeWallet.id, address: activeAddress.address });
            }
          }
          if (sighashTypes !== undefined) {
            const requestedInputIndices = signInputs === undefined
              ? Array.from({ length: psbtDetails.inputs.length }, (_, index) => index)
              : Object.values(signInputs).flat();
            const missingInputIndices = missingSighashEntries(requestedInputIndices, sighashTypes);
            if (missingInputIndices.length > 0) {
              throw invalidParams(
                `sighashTypes is indexed by absolute PSBT input index and is missing entries for inputs: ${missingInputIndices.join(', ')}`
              );
            }
          }
          return await runSignFlow({
            origin,
            method,
            params: { psbtHex, signInputs, sighashTypes, inscription, bitcoinPaymentIntent, marketplaceIntent },
            identity: { walletId: activeWallet.id, address: activeAddress.address },
            pairedAddresses: Object.keys(signInputs ?? {}).some(address => normalizeAddressForComparison(address) !== normalizeAddressForComparison(activeAddress.address)),
            approval: {
              eventPrefix: 'sign-psbt',
              analyticsEvent: 'psbt_signed',
              cancelMessage: 'User cancelled PSBT signing request',
              timeoutMessage: 'PSBT signing request timeout',
              mapResult: (result) => ({ hex: result.signedPsbtHex }),
            },
            create: async (requestId, requestKey) => {
              await beginSignFlow({
                id: requestId,
                origin,
                requestKey,
                kind: 'sign-psbt',
                psbtHex,
                signInputs,
                sighashTypes,
                signingPurpose: isBitcoinPayment ? 'bitcoin-payment' : 'counterparty',
                ...(bitcoinPaymentIntent ? { bitcoinPaymentIntent } : {}),
                ...(marketplaceIntent ? { marketplaceIntent } : {}),
                ...(inscription ? {
                  inscription: {
                    revealScript: inscription.revealScript!,
                    tapInternalKey: inscription.tapInternalKey!,
                  },
                } : {}),
                address: activeAddress.address,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              });
            },
            approvalRoute: '#/requests/psbt/approve',
          });
        }

        // ==================== Blockchain Query Methods ====================
        
        case 'xcp_getBalances': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }
          
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw walletLocked();
          }
          
          try {
            // Fetch BTC balance
            const btcBalance = await fetchBTCBalance(activeAddress.address);

            // Ask for XCP directly. Enumerating an address's balances is both
            // wasteful for collectors and wrong once XCP falls outside the
            // first page of assets.
            const xcpBalance = await fetchTokenBalance(activeAddress.address, 'XCP', {
              verbose: true,
              // UTXO-attached XCP is not spendable as the address's ordinary
              // balance and must not make a dApp think it can fund an action.
              type: 'address'
            });

            return {
              address: activeAddress.address,
              btc: {
                confirmed: btcBalance || 0,
                unconfirmed: 0,
                total: btcBalance || 0
              },
              xcp: xcpBalance.quantity_normalized ?? '0'
            };
          } catch (error) {
            console.error('[ProviderService] Error fetching balances:', error);
            // An unavailable API is not evidence that the wallet is empty.
            // Returning zeros made connected dApps reject valid transactions
            // as "insufficient balance" until a refresh happened to succeed.
            throw new Error('Unable to fetch wallet balances — please try again');
          }
        }
        
        case 'xcp_getAssets': {
          // Not supported - dApps should use Counterparty API directly
          throw new ProviderError(PROVIDER_ERROR_CODES.UNSUPPORTED_METHOD, 'Method xcp_getAssets is not supported. Please use the Counterparty API directly with the connected address.');
        }
        
        case 'xcp_getHistory': {
          // For privacy, we don't allow reading transaction history
          throw new ProviderError(PROVIDER_ERROR_CODES.UNSUPPORTED_METHOD, 'Permission denied - transaction history not available through provider');
        }

        // ==================== Transaction Broadcasting ====================
        
        case 'xcp_broadcastTransaction': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }

          const signedTx = params?.[0];
          if (!signedTx) {
            throw invalidParams('Signed transaction is required');
          }
          if (typeof signedTx !== 'string') {
            throw invalidParams('Signed transaction must be a hex string');
          }

          // Broadcasting is intentionally open to any signed transaction, so broadcasting alone
          // cannot make its outputs trusted. Only an exact transaction this origin just had the
          // extension sign, after every input was resolved as attachment-free, may seed change.
          let safeChangeAddress: string | null = null;
          try {
            safeChangeAddress = await findSafeChangeSigningAddress(signedTx, origin);
          } catch (error) {
            console.warn('[ProviderService] Failed to verify broadcast signing flow:', error);
          }

          // Check for replay attempt before broadcasting
          const replayCheck = await checkReplayAttempt(
            origin,
            'xcp_broadcastTransaction',
            [signedTx]
          );

          if (replayCheck.isReplay) {
            throw new Error(`Transaction replay detected: ${replayCheck.reason}`);
          }

          // Record before broadcasting so a repeat cannot slip through while this one is in
          // flight. The txid is not known until the node answers, so the record is keyed by a
          // pre-broadcast id — and the completion below must update *that* key. Marking the real
          // txid instead looked right but addressed a record that was never stored, so
          // updateTransactionStatus silently found nothing and every record stayed 'pending'.
          const pendingKey = generateRequestId('pending');
          recordTransaction(
            pendingKey,
            origin,
            'xcp_broadcastTransaction',
            [signedTx],
            { status: 'pending' }
          );

          // A failed attempt must not hold the record 'pending', or checkReplayAttempt refuses the
          // same transaction for five minutes and the site cannot retry what never went out. Resending
          // identical signed bytes is harmless: if an earlier attempt did land and only its answer
          // was lost, the node reports the transaction as already known, which the broadcaster
          // treats as success (isAlreadyKnownError), so a retry returns the txid rather than failing.
          let result: Awaited<ReturnType<typeof walletService.broadcastTransaction>>;
          try {
            result = await walletService.broadcastTransaction(signedTx);
          } catch (error) {
            markTransactionFailed(pendingKey);
            throw error;
          }

          // Mark as successfully broadcasted
          if (result.txid) {
            markTransactionBroadcasted(pendingKey);

            // The next provider signing request may spend this transaction's change before any
            // public Bitcoin indexer can return it. Persist only outputs that are both owned by
            // this wallet and safe plain-BTC change. Storage is best-effort because the broadcast
            // has already happened and must never be reported as failed after the fact.
            if (safeChangeAddress) {
              try {
                await rememberSuccessfulBroadcast(
                  signedTx,
                  [safeChangeAddress]
                );
              } catch (error) {
                console.warn('[ProviderService] Failed to remember broadcast change:', error);
              }
            }
          }

          // Track successful broadcast
          await analytics.track('transaction_broadcasted');

          return result;
        }
        
        default:
          throw new ProviderError(PROVIDER_ERROR_CODES.UNSUPPORTED_METHOD, `Unsupported method: ${method}`);
      }
      
    } catch (error) {
      // 4001 is the user's answer (declined, closed or let an approval lapse), not a failure. A
      // declined connection is already counted as request_rejected by the approval service, and the
      // documented site handling (PROVIDER.md) skips 4001 the same way. Counting it here would make
      // provider_error track how often users say no. An approval window that could not be opened
      // is also sent as 4001, but nobody answered it: that one is a failure and is counted.
      if (
        error instanceof ProviderError
        && error.code === PROVIDER_ERROR_CODES.USER_REJECTED
        && error.message !== APPROVAL_WINDOW_FAILED_MESSAGE
      ) throw error;

      // Log error for debugging (safely extract hostname)
      let hostname = origin;
      try { hostname = new URL(origin).hostname; } catch { /* use raw origin */ }
      console.error('[ProviderService] Provider request failed:', {
        origin: hostname,
        method,
        error: (error as Error).message
      });

      await analytics.track('provider_error');

      throw error;
    }
  }
  
  /**
   * Disconnect an origin
   */
  async function disconnect(origin: string): Promise<void> {
    const connectionService = getConnectionService();
    await connectionService.disconnect(origin);
  }

  return {
    handleRequest,
    disconnect,
  };
}

// Register proxy service for cross-context communication
export const [registerProviderService, getProviderService] = defineProxyServer(
  PROVIDER_SERVICE_NAME,
  createProviderService,
  PROVIDER_SERVICE_POLICY,
);
