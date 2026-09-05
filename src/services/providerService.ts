/**
 * ProviderService - Web3 Provider API
 *
 * Main interface for dApp integration, working with:
 * - ConnectionService: Permission and connection management
 * - ApprovalService: User approval workflows
 * - WalletService: Wallet state and cryptographic operations
 */

import { type AddressFormat, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { parseBitcoinPaymentIntent } from '@/core/bitcoin/providerPayment';
import { resolveProviderSignInputs } from '@/core/bitcoin/providerSigningPlan';
import { extractPsbtDetails, tapLeafOwnerAddress, validateSignInputs } from '@/core/bitcoin/psbt';
import { fetchTokenBalance } from '@/core/counterparty/api';
import { parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import { parseAcceptanceCpfpBundleIntents } from '@/core/counterparty/marketplaceBundle';
import {
  marketplaceTransactionHeaderProblem,
  parseMarketplaceIntent,
} from '@/core/counterparty/marketplaceIntent';
import { generateRequestId } from '@/core/id';
import { checkReplayAttempt, markTransactionBroadcasted, recordTransaction } from '@/core/replayPrevention';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { getPairedAddressFormats } from '@/core/wallet/addressDeriver';
import { getSessionGeneration } from '@/platform/auth/sessionManager';
import { analytics } from '@/platform/fathom';
import { openExtensionPopup } from '@/platform/popup';
import { apiRateLimiter, connectionRateLimiter, transactionRateLimiter } from '@/platform/provider/rateLimiter';
import { rememberSuccessfulBroadcast } from '@/platform/provider/recentBroadcasts';
import { assertSignDeliveryAuthorized, type SignDeliveryGuard } from '@/platform/provider/signDelivery';
import {
  beginSignFlow,
  type CompletedSignFlow,
  computeRequestKey,
  findActiveFlowByKey,
  findSafeChangeSigningAddress,
  getSignFlow,
  SIGN_FLOW_TTL_MS,
  type SignFlowEventPrefix,
} from '@/platform/provider/signFlow';
import { defineProxyService } from '@/platform/proxy';
import { createWriteLock } from '@/platform/storage/mutex';
import type { AuthorizedRequest } from '@/platform/storage/requestStorage';
import { keychainExists } from '@/platform/storage/walletStorage';
import { getApprovalService } from '@/services/approvalService';
import { getConnectionService } from '@/services/connectionService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getUpdateService } from '@/services/updateService';
import { getWalletService } from '@/services/walletService';
import type { ApprovalRequest } from '@/types/provider';


// Define proper types for provider requests and responses
export type ProviderRequestParams = unknown[];
export type ProviderMetadata = Record<string, unknown>;
export type ProviderResponse = unknown;

const CONNECTION_PROOF_PREFIX = 'xcp-wallet\n';

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
  handleRequest: (origin: string, method: string, params?: ProviderRequestParams, metadata?: ProviderMetadata) => Promise<ProviderResponse>;

  /**
   * Check if origin is connected
   */
  isConnected: (origin: string) => Promise<boolean>;

  /**
   * Disconnect an origin
   */
  disconnect: (origin: string) => Promise<void>;

  /**
   * Get the current pending approval if any
   */
  getCurrentApproval: () => Promise<ApprovalRequest | null>;

  /**
   * Get statistics about pending requests
   */
  getRequestStats: () => Promise<any>;

  /**
   * Cleanup resources and destroy the service
   */
  destroy: () => Promise<void>;
}

/**
 * Drives the popup approval lifecycle for a dApp signing request: registers the
 * critical operation, resolves/rejects on the popup's complete/cancel events,
 * times out after 10 minutes, and cleans up listeners (and any per-request
 * state via onCleanup) on every exit path.
 */
function awaitSignApproval<T>(opts: {
  requestId: string;
  expiresAt: number;
  eventPrefix: SignFlowEventPrefix;
  analyticsEvent: string;
  cancelMessage: string;
  timeoutMessage: string;
  mapResult: (result: any) => T;
  authorizeDelivery: (flow: CompletedSignFlow) => Promise<SignDeliveryGuard>;
  onCleanup?: () => void;
}): Promise<T> {
  const updateService = getUpdateService();
  updateService.registerCriticalOperation(`${opts.eventPrefix}-${opts.requestId}`);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let completing = false;
    let timeout: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (poll) clearInterval(poll);
      updateService.unregisterCriticalOperation(`${opts.eventPrefix}-${opts.requestId}`);
      eventEmitterService.off(`${opts.eventPrefix}-complete-${opts.requestId}`, handleComplete);
      eventEmitterService.off(`${opts.eventPrefix}-cancel-${opts.requestId}`, handleCancel);
      // Keep the terminal result until its original deadline. Removing it here
      // loses recovery when the worker stops after signing but before delivery.
      opts.onCleanup?.();
    };

    const handleFailure = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleComplete = async () => {
      if (settled || completing) return;
      completing = true;
      try {
        // The event is a wake-up signal. Only the persisted terminal outcome is
        // authoritative, including when this listener rejoins after a restart.
        const flow = await getSignFlow(opts.requestId);
        if (flow?.status !== 'completed') throw new Error('Signing result is unavailable or expired');
        const assertDelivery = await opts.authorizeDelivery(flow);
        if (settled) return;
        assertDelivery();
        const result = opts.mapResult(flow.result);
        settled = true;
        cleanup();
        void analytics.track(opts.analyticsEvent);
        resolve(result);
      } catch (error) {
        handleFailure(error);
      } finally {
        completing = false;
      }
    };

    const handleCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, opts.cancelMessage));
    };

    timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(opts.timeoutMessage));
    }, Math.max(0, opts.expiresAt - Date.now()));

    eventEmitterService.on(`${opts.eventPrefix}-complete-${opts.requestId}`, handleComplete);
    eventEmitterService.on(`${opts.eventPrefix}-cancel-${opts.requestId}`, handleCancel);

    // Recovery path: if this worker is a fresh rejoin after a restart, the popup's
    // outcome is persisted in signFlow even though the original listener was lost.
    poll = setInterval(() => {
      if (settled) return;
      void getSignFlow(opts.requestId).then(async (flow) => {
        if (settled || !flow) return;
        if (flow.status === 'completed') await handleComplete();
        else if (flow.status === 'cancelled') handleCancel();
      }).catch(handleFailure);
    }, 1500);
  });
}

/**
 * Run a signing request through its durable flow: recover a completed result,
 * rejoin a pending one (no new popup), or begin a fresh flow. createAndOpen
 * stores the per-type request and opens the popup for the new-flow case.
 */
const withFlowCreationLock = createWriteLock();

async function runSignFlow<T>(args: {
  origin: string;
  method: string;
  params: unknown;
  identity: { walletId: string; address: string };
  pairedAddresses?: boolean;
  approval: {
    eventPrefix: SignFlowEventPrefix;
    analyticsEvent: string;
    cancelMessage: string;
    timeoutMessage: string;
    mapResult: (result: any) => T;
  };
  createAndOpen: (requestId: string, requestKey: string) => Promise<void>;
}): Promise<T> {
  const sessionGeneration = getSessionGeneration();
  const requestKey = computeRequestKey(args.origin, args.method, args.params, args.identity);
  // Lookup and creation are one command; concurrent identical calls join it.
  const flow = await withFlowCreationLock(async () => {
    const existing = await findActiveFlowByKey(requestKey, args.origin);
    if (existing) return existing;
    const requestId = generateRequestId(args.approval.eventPrefix);
    await args.createAndOpen(requestId, requestKey);
    const created = await getSignFlow(requestId);
    if (!created) throw new Error('Signing request could not be stored');
    return created;
  });

  const authorizeDelivery = (completed: CompletedSignFlow) =>
    assertSignDeliveryAuthorized(completed, args.pairedAddresses ?? false, sessionGeneration);
  if (flow.status === 'completed') {
    const assertDelivery = await authorizeDelivery(flow);
    assertDelivery();
    void analytics.track(args.approval.analyticsEvent);
    return args.approval.mapResult(flow.result);
  }
  return awaitSignApproval({ ...args.approval, authorizeDelivery, requestId: flow.id,
    expiresAt: flow.timestamp + SIGN_FLOW_TTL_MS });
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

      const message = `xcp-wallet\norigin:${context.request.origin}\nnonce:${nonce}\nissued:${issued}`;

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
    const authorize = (paired: boolean) => assertSignDeliveryAuthorized(request, paired, sessionGeneration);
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
   * ADR-018: Paired-address provider capability
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
    onBeforeConnect?: () => Promise<void>
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
      pairedSupported: activeWallet.type === 'mnemonic' && Boolean(getPairedAddressFormats(activeWallet.addressFormat)),
      format: activeWallet.addressFormat,
    };

    if (await connectionService.hasPermission(origin)) {
      if (pairedAddresses) {
        await connectionService.requestPairedAddressPermission(
          origin,
          activeAddress.address,
          activeWallet.id
        );
      }
      return buildConnectResponse(await getAccounts(origin), context);
    }

    await onBeforeConnect?.();

    const accounts = await connectionService.connect(
      origin,
      activeAddress.address,
      activeWallet.id,
      pairedAddresses
    );
    await analytics.track('connection_established');
    return buildConnectResponse(accounts, context);
  }

  /**
   * Handle provider requests from dApps
   */
  async function handleRequest(origin: string, method: string, params: ProviderRequestParams = [], metadata?: ProviderMetadata): Promise<ProviderResponse> {
    
    // Log request signing information if available
    if (metadata?.signature) {
      console.debug('[ProviderService] Request signed with metadata:', {
        hasSignature: !!metadata.signature,
        hasPublicKey: !!metadata.publicKey,
        timestamp: metadata.timestamp
      });
    }
    
    try {
      // Validate parameter size to prevent memory exhaustion
      const MAX_PARAM_SIZE = 1024 * 1024; // 1MB limit
      let paramSize: number;
      try {
        paramSize = JSON.stringify(params).length;
      } catch {
        // If params can't be serialized (circular refs), reject the request
        await analytics.track('request_rejected');
        throw new Error('Request parameters cannot be serialized');
      }
      if (paramSize > MAX_PARAM_SIZE) {
        await analytics.track('request_rejected');
        let hostname = origin;
        try { hostname = new URL(origin).hostname; } catch { /* use raw origin */ }
        console.warn('[ProviderService] Request parameters too large', {
          origin: hostname,
          method,
          paramSize,
          maxSize: MAX_PARAM_SIZE
        });
        throw new Error('Request parameters too large (max 1MB)');
      }
      
      // Apply rate limiting based on method type
      const isConnectionMethod = method === 'xcp_requestAccounts';
      const isTransactionMethod = method.startsWith('xcp_sign') || method === 'xcp_broadcastTransaction';
      
      if (isConnectionMethod && !connectionRateLimiter.isAllowed(origin)) {
        const resetTime = connectionRateLimiter.getResetTime(origin);
        throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds before trying again.`);
      }
      
      if (isTransactionMethod && !transactionRateLimiter.isAllowed(origin)) {
        const resetTime = transactionRateLimiter.getResetTime(origin);
        throw new Error(`Transaction rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds.`);
      }
      
      // General API rate limit
      if (!apiRateLimiter.isAllowed(origin)) {
        const resetTime = apiRateLimiter.getResetTime(origin);
        throw new Error(`API rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds.`);
      }
      
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
            await openExtensionPopup();

            // Wait for wallet creation, then continue with connection flow
            return new Promise((resolve, reject) => {
              let settled = false;
              let timeout: ReturnType<typeof setTimeout>;

              // Centralized cleanup - called on any exit path
              const cleanup = () => {
                if (timeout) clearTimeout(timeout);
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

              eventEmitterService.on('wallet-created', handleWalletCreated);
            });
          }

          // Check if wallet is locked
          const isUnlocked = await walletService.isKeychainUnlocked();
          if (!isUnlocked) {
            // Open popup for unlock and store the pending request
            const _approvalService = getApprovalService();
            const requestId = generateRequestId(`${origin}-unlock`);

            // Store the pending connection request
            eventEmitterService.emit('pending-unlock-connection', {
              requestId,
              origin,
              method: 'xcp_requestAccounts'
            });

            // Open the regular popup - it will automatically show unlock screen
            // and then navigate to approvals after unlock
            await openExtensionPopup();

            // Wait for unlock and then continue with connection
            return new Promise((resolve, reject) => {
              let settled = false;
              let timeout: ReturnType<typeof setTimeout>;

              // Centralized cleanup - called on any exit path
              const cleanup = () => {
                if (timeout) clearTimeout(timeout);
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

                // Continue with connection flow
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
                reject(new Error('Unlock timeout - please try again'));
              }, 5 * 60 * 1000); // 5 minute timeout

              eventEmitterService.on('wallet-unlocked', handleUnlock);
            });
          }

          return completeConnection(origin, pairedAddresses);

        }
        
        case 'xcp_accounts': {
          return getAccounts(origin);
        }
        
        case 'xcp_getAddresses': {
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) throw new Error('No active address');
          const paired = await connectionService.hasPairedAddressPermission(
            origin,
            activeWallet.id,
            activeAddress.address
          );
          const active = {
            address: activeAddress.address,
            publicKey: activeAddress.pubKey,
            type: activeWallet.addressFormat,
          };
          if (!paired) return { active };
          const addresses = await walletService.getPairedAddresses();
          return {
            active,
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

          // Validate message type and presence
          if (!message) {
            throw new Error('Message is required');
          }
          if (typeof message !== 'string') {
            throw new Error('Message must be a string');
          }
          if (message.startsWith(CONNECTION_PROOF_PREFIX)) {
            throw new Error('Messages in the connection-proof namespace are reserved');
          }

          // Validate address type if provided
          if (address !== undefined && typeof address !== 'string') {
            throw new Error('Address must be a string');
          }

          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }

          // Get active address/wallet for the request
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) {
            throw new Error('No active address');
          }

          let signingAddress = activeAddress.address;
          if (
            address
            && normalizeAddressForComparison(address) !== normalizeAddressForComparison(activeAddress.address)
          ) {
            const supportsPairedAddresses = Boolean(
              getPairedAddressFormats(activeWallet.addressFormat)
            );
            const paired = activeWallet.type === 'mnemonic' && supportsPairedAddresses
              ? await walletService.getPairedAddresses()
              : null;
            const target = paired
              ? [paired.legacy, paired.segwit].find(candidate =>
                  normalizeAddressForComparison(candidate.address)
                    === normalizeAddressForComparison(address)
                )
              : undefined;
            if (!target) {
              throw new Error('Specified address is not the active address or its paired sibling');
            }
            if (!await connectionService.hasPairedAddressPermission(
              origin,
              activeWallet.id,
              activeAddress.address
            )) {
              throw new ProviderError(
                PROVIDER_ERROR_CODES.UNAUTHORIZED,
                'Paired Legacy/SegWit address access has not been granted'
              );
            }
            signingAddress = target.address;
          }

          return runSignFlow({
            origin,
            method,
            params: { message, signingAddress },
            identity: { walletId: activeWallet.id, address: activeAddress.address },
            pairedAddresses: signingAddress !== activeAddress.address,
            approval: {
              eventPrefix: 'sign-message',
              analyticsEvent: 'message_signed',
              cancelMessage: 'User cancelled sign message request',
              timeoutMessage: 'Sign message request timeout',
              mapResult: (result) => result.signature,
            },
            createAndOpen: async (requestId, requestKey) => {
              // Binds the request to the authorized address/wallet so signing
              // can't later use a different identity.
              await beginSignFlow({
                id: requestId,
                origin,
                requestKey,
                kind: 'sign-message',
                message,
                address: activeAddress.address,
                signingAddress,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              });
              await openExtensionPopup(`#/requests/message/approve?requestId=${requestId}`);
            },
          });
        }
        
        case 'xcp_signTransaction': {
          const txParams = params?.[0] as { hex?: string } | string | undefined;

          // Support both { hex: "..." } object and plain string
          const rawTxHex = typeof txParams === 'string' ? txParams : txParams?.hex;

          if (!rawTxHex) {
            throw new Error('Transaction hex is required');
          }

          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }

          // Get active address/wallet for the request
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) {
            throw new Error('No active address');
          }

          return runSignFlow({
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
            createAndOpen: async (requestId, requestKey) => {
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
              await openExtensionPopup(`#/requests/transaction/approve?requestId=${requestId}`);
            },
          });
        }

        case 'xcp_signPsbts': {
          const bundleParams = params?.[0];
          if (!bundleParams || typeof bundleParams !== 'object' || Array.isArray(bundleParams)) {
            throw new Error('PSBT bundle parameters must be an object with requests');
          }
          const requests = (bundleParams as { requests?: unknown }).requests;
          if (!Array.isArray(requests) || requests.length < 1 || requests.length > 8) {
            throw new Error('This wallet version supports 1..8 linked PSBT requests');
          }
          const parsedRequests = requests.map((request, requestIndex) => {
            if (!request || typeof request !== 'object' || Array.isArray(request)) {
              throw new Error(`PSBT bundle request ${requestIndex} must be an object`);
            }
            const candidate = request as {
              hex?: unknown;
              signInputs?: unknown;
              sighashTypes?: unknown;
              intent?: unknown;
            };
            if (typeof candidate.hex !== 'string' || candidate.hex.length === 0) {
              throw new Error(`PSBT bundle request ${requestIndex} requires hex`);
            }
            if (
              !candidate.signInputs
              || typeof candidate.signInputs !== 'object'
              || Array.isArray(candidate.signInputs)
              || Object.keys(candidate.signInputs).length === 0
            ) {
              throw new Error(`PSBT bundle request ${requestIndex} requires explicit signInputs`);
            }
            if (
              !Array.isArray(candidate.sighashTypes)
              || candidate.sighashTypes.some(value => ![0x01, 0x83].includes(value as number))
            ) {
              throw new Error(
                `PSBT bundle request ${requestIndex} supports only ALL or SINGLE|ANYONECANPAY`,
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
          const parsedBundle = exactCpfp
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
            : parseMarketplaceBatchIntents(parsedRequests.map(request => request.intent));

          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(
              PROVIDER_ERROR_CODES.UNAUTHORIZED,
              'Unauthorized - not connected to wallet',
            );
          }
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) throw new Error('No active address');

          const supportsPairedAddresses = Boolean(
            getPairedAddressFormats(activeWallet.addressFormat),
          );
          const paired = activeWallet.type === 'mnemonic' && supportsPairedAddresses
            ? await walletService.getPairedAddresses()
            : null;
          const allowedAddresses = [
            activeAddress.address,
            ...(paired ? [paired.legacy.address, paired.segwit.address] : []),
          ];
          const pairedAddressSet = new Set(
            paired
              ? [paired.legacy.address, paired.segwit.address].map(normalizeAddressForComparison)
              : [],
          );
          const normalizedActiveAddress = normalizeAddressForComparison(activeAddress.address);
          let usesPairedAddress = false;

          for (const [requestIndex, request] of parsedRequests.entries()) {
            const details = extractPsbtDetails(request.psbtHex);
            const marketplaceIntent = parsedBundle.intents[requestIndex]!;
            const headerProblem = marketplaceTransactionHeaderProblem(
              marketplaceIntent,
              details.transactionVersion,
              details.lockTime,
            );
            if (headerProblem) {
              throw new Error(`PSBT bundle request ${requestIndex}: ${headerProblem}`);
            }
            const permitsNullBuyerPlaceholder = marketplaceIntent.action === 'create_listing';
            const missingAuthenticatedPrevout = details.inputs.some((input, inputIndex) =>
              input.value === undefined && !(permitsNullBuyerPlaceholder && inputIndex === 0));
            if ((!permitsNullBuyerPlaceholder && details.unfunded) || missingAuthenticatedPrevout) {
              throw new Error(
                `PSBT bundle request ${requestIndex} must be fully funded with authenticated prevouts`,
              );
            }
            if (request.sighashTypes.length > details.inputs.length) {
              throw new Error(`PSBT bundle request ${requestIndex} has too many sighash entries`);
            }
            if (request.sighashTypes.some(
              (value, index) => value === 0x83 && index >= details.outputs.length,
            )) {
              throw new Error(
                `PSBT bundle request ${requestIndex} uses SINGLE without a paired output`,
              );
            }
            const validation = validateSignInputs(
              request.signInputs,
              allowedAddresses,
              details.inputs.length,
              details.inputs.map(input => tapLeafOwnerAddress(input) ?? input.address),
            );
            if (!validation.valid) {
              throw new Error(`PSBT bundle request ${requestIndex}: ${validation.error}`);
            }
            const requestedInputIndices = Object.values(request.signInputs).flat();
            const missing = requestedInputIndices.filter(
              inputIndex => request.sighashTypes[inputIndex] === undefined,
            );
            if (missing.length > 0) {
              throw new Error(
                `PSBT bundle request ${requestIndex} is missing absolute sighash entries for inputs: ${missing.join(', ')}`,
              );
            }
            usesPairedAddress ||= Object.keys(request.signInputs).some(address => {
              const normalizedAddress = normalizeAddressForComparison(address);
              return normalizedAddress !== normalizedActiveAddress
                && pairedAddressSet.has(normalizedAddress);
            });
          }
          if (
            usesPairedAddress
            && !await connectionService.hasPairedAddressPermission(
              origin,
              activeWallet.id,
              activeAddress.address,
            )
          ) {
            throw new ProviderError(
              PROVIDER_ERROR_CODES.UNAUTHORIZED,
              'Paired Legacy/SegWit address access has not been granted',
            );
          }

          return runSignFlow({
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
            createAndOpen: async (requestId, requestKey) => {
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
              await openExtensionPopup(`#/requests/psbts/approve?requestId=${requestId}`);
            },
          });
        }

        case 'xcp_signPsbt':
        case 'xcp_signBitcoinPsbt': {
          const isBitcoinPayment = method === 'xcp_signBitcoinPsbt';
          const psbtParams = params?.[0];

          // Validate params structure
          if (!psbtParams || typeof psbtParams !== 'object') {
            throw new Error('PSBT parameters must be an object with hex property');
          }

          const { hex: psbtHex, signInputs: requestedSignInputs, sighashTypes, inscription, intent } = psbtParams as {
            hex?: string;
            signInputs?: Record<string, number[]>;
            sighashTypes?: number[];
            inscription?: { revealScript?: string; tapInternalKey?: string };
            intent?: unknown;
          };
          let signInputs = requestedSignInputs;

          if (!psbtHex) {
            throw new Error('PSBT hex is required');
          }
          if (typeof psbtHex !== 'string') {
            throw new Error('PSBT hex must be a string');
          }
          const bitcoinPaymentIntent = isBitcoinPayment
            ? parseBitcoinPaymentIntent(intent)
            : undefined;
          const marketplaceIntent = !isBitcoinPayment && intent !== undefined
            ? parseMarketplaceIntent(intent)
            : undefined;
          if (isBitcoinPayment && inscription !== undefined) {
            throw new Error('Plain Bitcoin payment requests cannot carry inscription context');
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
            throw new Error('inscription must carry revealScript and tapInternalKey as hex strings');
          }
          if (signInputs !== undefined && (
            signInputs === null || typeof signInputs !== 'object' || Array.isArray(signInputs)
          )) {
            throw new Error('signInputs must be an address-to-input-indices object');
          }
          if (isBitcoinPayment && (!signInputs || Object.keys(signInputs).length === 0)) {
            throw new Error('Plain Bitcoin payment requests require explicit signInputs');
          }
          if (sighashTypes !== undefined) {
            if (!Array.isArray(sighashTypes) || sighashTypes.some(
              value => !(isBitcoinPayment ? [0x01] : [0x01, 0x81, 0x83]).includes(value)
            )) {
              throw new Error(isBitcoinPayment
                ? 'Plain Bitcoin payment requests support only SIGHASH_ALL'
                : 'Only SIGHASH_ALL, ALL|ANYONECANPAY, and SINGLE|ANYONECANPAY are supported');
            }
          }
          if (isBitcoinPayment && sighashTypes === undefined) {
            throw new Error('Plain Bitcoin payment requests require explicit SIGHASH_ALL entries');
          }

          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
          }

          // Get active address/wallet for the request
          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();
          if (!activeAddress || !activeWallet) {
            throw new Error('No active address');
          }

          const psbtDetails = extractPsbtDetails(psbtHex);
          signInputs = resolveProviderSignInputs(psbtDetails, activeAddress.address, signInputs, sighashTypes);
          if (marketplaceIntent) {
            const headerProblem = marketplaceTransactionHeaderProblem(
              marketplaceIntent,
              psbtDetails.transactionVersion,
              psbtDetails.lockTime,
            );
            if (headerProblem) throw new Error(headerProblem);
          }
          if (isBitcoinPayment && (
            psbtDetails.unfunded
            || psbtDetails.inputs.some(input => input.value === undefined)
          )) {
            throw new Error(
              'Plain Bitcoin payment requests must be fully funded with authenticated prevout amounts before review'
            );
          }
          if (sighashTypes && sighashTypes.length > psbtDetails.inputs.length) {
            throw new Error('sighashTypes contains more entries than the PSBT has inputs');
          }
          if (sighashTypes?.some(
            (value, index) => value === 0x83 && index >= psbtDetails.outputs.length
          )) {
            throw new Error('SIGHASH_SINGLE requires an output at the same index');
          }

          if (signInputs !== undefined) {
            const supportsPairedAddresses = Boolean(
              getPairedAddressFormats(activeWallet.addressFormat)
            );
            const paired = activeWallet.type === 'mnemonic' && supportsPairedAddresses
              ? await walletService.getPairedAddresses()
              : null;
            const allowedAddresses = [
              activeAddress.address,
              ...(paired ? [paired.legacy.address, paired.segwit.address] : []),
            ];
            // Ownership per input: normally the prevout's own address, but an inscription
            // reveal spends a commit output whose address belongs to nobody — there the input is
            // owned by whoever the declared leaf's checksig key encodes to (tapLeafOwnerAddress).
            const validation = validateSignInputs(
              signInputs,
              allowedAddresses,
              psbtDetails.inputs.length,
              psbtDetails.inputs.map(input => tapLeafOwnerAddress(input) ?? input.address)
            );
            if (!validation.valid) throw new Error(validation.error);

            const pairedAddressSet = new Set(
              paired
                ? [paired.legacy.address, paired.segwit.address].map(normalizeAddressForComparison)
                : []
            );
            const normalizedActiveAddress = normalizeAddressForComparison(activeAddress.address);
            const usesPairedAddress = Object.keys(signInputs).some(address => {
              const normalizedAddress = normalizeAddressForComparison(address);
              return normalizedAddress !== normalizedActiveAddress
                && pairedAddressSet.has(normalizedAddress);
            });
            if (usesPairedAddress && !await connectionService.hasPairedAddressPermission(
              origin,
              activeWallet.id,
              activeAddress.address
            )) {
              throw new ProviderError(
                PROVIDER_ERROR_CODES.UNAUTHORIZED,
                'Paired Legacy/SegWit address access has not been granted'
              );
            }
          }
          if (sighashTypes !== undefined) {
            const requestedInputIndices = signInputs === undefined
              ? Array.from({ length: psbtDetails.inputs.length }, (_, index) => index)
              : Object.values(signInputs).flat();
            const missingInputIndices = requestedInputIndices.filter(
              index => sighashTypes[index] === undefined
            );
            if (missingInputIndices.length > 0) {
              throw new Error(
                `sighashTypes is indexed by absolute PSBT input index and is missing entries for inputs: ${missingInputIndices.join(', ')}`
              );
            }
          }
          return runSignFlow({
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
            createAndOpen: async (requestId, requestKey) => {
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
              await openExtensionPopup(`#/requests/psbt/approve?requestId=${requestId}`);
            },
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
            throw new Error('No active address');
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
            throw new Error('Signed transaction is required');
          }
          if (typeof signedTx !== 'string') {
            throw new Error('Signed transaction must be a hex string');
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

          // Broadcast using WalletService directly
          const result = await walletService.broadcastTransaction(signedTx);

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
   * Check if origin is connected
   */
  async function isConnected(origin: string): Promise<boolean> {
    const connectionService = getConnectionService();
    return await connectionService.hasPermission(origin);
  }
  
  /**
   * Disconnect an origin
   */
  async function disconnect(origin: string): Promise<void> {
    const connectionService = getConnectionService();
    await connectionService.disconnect(origin);
  }
  
  /**
   * Get the current pending approval if any
   */
  async function getCurrentApproval(): Promise<ApprovalRequest | null> {
    const approvalService = getApprovalService();
    return approvalService.getCurrentApproval();
  }

  /**
   * Get statistics about pending requests
   */
  async function getRequestStats(): Promise<any> {
    const connectionService = getConnectionService();
    const approvalService = getApprovalService();

    const connectedSites = await connectionService.getConnectedWebsites();
    const currentApproval = approvalService.getCurrentApproval();

    return {
      connections: {
        connectedSites: connectedSites.length,
        sites: connectedSites
      },
      approval: currentApproval
    };
  }
  
  /**
   * Cleanup resources and destroy the service
   */
  async function destroy(): Promise<void> {
    console.log('[ProviderService] Destroying...');
  }

  return {
    handleRequest,
    isConnected,
    disconnect,
    getCurrentApproval,
    getRequestStats,
    destroy
  };
}

// Register proxy service for cross-context communication
export const [registerProviderService, getProviderService] = defineProxyService(
  'ProviderService',
  createProviderService,
  { methods: { handleRequest: 'command', isConnected: 'read', disconnect: 'command',
    getCurrentApproval: 'read', getRequestStats: 'read' }, contentScript: 'provider' },
);
