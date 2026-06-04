/**
 * ProviderService - Web3 Provider API
 *
 * Main interface for dApp integration, working with:
 * - ConnectionService: Permission and connection management
 * - ApprovalService: User approval workflows
 * - WalletService: Wallet state and cryptographic operations
 */

import { defineProxyService } from '@/utils/proxy';
import { getWalletService } from '@/services/walletService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getConnectionService } from '@/services/connectionService';
import { getApprovalService } from '@/services/approvalService';
import type { ApprovalRequest } from '@/types/provider';
import { connectionRateLimiter, transactionRateLimiter, apiRateLimiter } from '@/utils/provider/rateLimiter';
import { analytics } from '@/utils/fathom';
import { analyzeCSP } from '@/utils/security/cspValidation';
import { signMessageRequestStorage } from '@/utils/storage/signMessageRequestStorage';
import { signPsbtRequestStorage } from '@/utils/storage/signPsbtRequestStorage';
import { signTransactionRequestStorage } from '@/utils/storage/signTransactionRequestStorage';
import { getUpdateService } from '@/services/updateService';
import {
  computeRequestKey,
  beginSignFlow,
  findActiveFlowByKey,
  getSignFlow,
  removeSignFlow,
} from '@/utils/provider/signFlow';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin/balance';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';
import { checkReplayAttempt, recordTransaction, markTransactionBroadcasted } from '@/utils/security/replayPrevention';
import { signMessage as signMessageDirect } from '@/utils/blockchain/bitcoin/messageSigner';
import { openExtensionPopup } from '@/utils/popup';
import { generateRequestId } from '@/utils/id';
import { keychainExists } from '@/utils/storage/walletStorage';
import { ProviderError, PROVIDER_ERROR_CODES } from '@/utils/errors';

// In-memory storage for active requests (primary storage, fast access)
const activeSignRequests = new Map<string, any>();
const activeSignPsbtRequests = new Map<string, any>();
const activeSignTransactionRequests = new Map<string, any>();

// Auto-cleanup old requests every minute - store interval ID for cleanup
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval(): void {
  if (cleanupIntervalId) return; // Already running

  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [id, request] of activeSignRequests.entries()) {
      if (now - request.timestamp > maxAge) {
        activeSignRequests.delete(id);
        console.log('[ProviderService] Cleaned up stale sign request:', id);
      }
    }

    for (const [id, request] of activeSignPsbtRequests.entries()) {
      if (now - request.timestamp > maxAge) {
        activeSignPsbtRequests.delete(id);
        console.log('[ProviderService] Cleaned up stale sign PSBT request:', id);
      }
    }

    for (const [id, request] of activeSignTransactionRequests.entries()) {
      if (now - request.timestamp > maxAge) {
        activeSignTransactionRequests.delete(id);
        console.log('[ProviderService] Cleaned up stale sign transaction request:', id);
      }
    }
  }, 60000);
}

function stopCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Start cleanup interval immediately
startCleanupInterval();

// Define proper types for provider requests and responses
export type ProviderRequestParams = unknown[];
export type ProviderMetadata = Record<string, unknown>;
export type ProviderResponse = unknown;

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
  eventPrefix: string;
  analyticsEvent: string;
  cancelMessage: string;
  timeoutMessage: string;
  mapResult: (result: any) => T;
  onCleanup?: () => void;
}): Promise<T> {
  const updateService = getUpdateService();
  updateService.registerCriticalOperation(`${opts.eventPrefix}-${opts.requestId}`);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (poll) clearInterval(poll);
      updateService.unregisterCriticalOperation(`${opts.eventPrefix}-${opts.requestId}`);
      eventEmitterService.off(`${opts.eventPrefix}-complete-${opts.requestId}`, handleComplete);
      eventEmitterService.off(`${opts.eventPrefix}-cancel-${opts.requestId}`, handleCancel);
      void removeSignFlow(opts.requestId);
      opts.onCleanup?.();
    };

    const handleComplete = (result: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      analytics.track(opts.analyticsEvent);
      resolve(opts.mapResult(result));
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
    }, 10 * 60 * 1000);

    eventEmitterService.on(`${opts.eventPrefix}-complete-${opts.requestId}`, handleComplete);
    eventEmitterService.on(`${opts.eventPrefix}-cancel-${opts.requestId}`, handleCancel);

    // Recovery path: if this worker is a fresh rejoin after a restart, the popup's
    // outcome is persisted in signFlow even though the original listener was lost.
    poll = setInterval(() => {
      if (settled) return;
      void getSignFlow(opts.requestId).then((flow) => {
        if (settled || !flow) return;
        if (flow.status === 'completed') handleComplete(flow.result);
        else if (flow.status === 'cancelled') handleCancel();
      });
    }, 1500);
  });
}

/**
 * Run a signing request through its durable flow: recover a completed result,
 * rejoin a pending one (no new popup), or begin a fresh flow. createAndOpen
 * stores the per-type request and opens the popup for the new-flow case.
 */
async function runSignFlow<T>(args: {
  origin: string;
  method: string;
  params: unknown;
  approval: {
    eventPrefix: string;
    analyticsEvent: string;
    cancelMessage: string;
    timeoutMessage: string;
    mapResult: (result: any) => T;
  };
  cleanup?: (requestId: string) => void;
  createAndOpen: (requestId: string) => Promise<void>;
}): Promise<T> {
  const requestKey = computeRequestKey(args.origin, args.method, args.params);
  const existing = await findActiveFlowByKey(requestKey);

  const awaitFor = (requestId: string) =>
    awaitSignApproval({
      ...args.approval,
      requestId,
      onCleanup: args.cleanup ? () => args.cleanup!(requestId) : undefined,
    });

  if (existing?.status === 'completed') {
    await removeSignFlow(existing.id);
    args.cleanup?.(existing.id);
    analytics.track(args.approval.analyticsEvent);
    return args.approval.mapResult(existing.result);
  }
  if (existing?.status === 'pending') {
    // Rejoin the original flow rather than opening a duplicate popup.
    return awaitFor(existing.id);
  }

  const requestId = generateRequestId(args.approval.eventPrefix);
  await beginSignFlow(requestId, args.origin, requestKey);
  await args.createAndOpen(requestId);
  return awaitFor(requestId);
}

export function createProviderService(): ProviderService {
  /**
   * Generate a connection proof: auto-sign a deterministic message proving
   * the user controls the address. No user prompt — they already approved connecting.
   * The message format is locked down so it can't be confused with arbitrary signing.
   */
  async function generateConnectionProof(origin: string): Promise<{
    address: string;
    message: string;
    signature: string;
    verification: { method: 'BIP-322'; format: string };
  } | null> {
    try {
      const walletService = getWalletService();
      const activeAddress = await walletService.getActiveAddress();
      const activeWallet = await walletService.getActiveWallet();
      if (!activeAddress || !activeWallet) return null;

      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const issued = Math.floor(Date.now() / 1000);

      const message = `xcp-wallet\norigin:${origin}\nnonce:${nonce}\nissued:${issued}`;

      const addressFormat = activeWallet.addressFormat || 'p2tr';

      const privateKeyResult = await walletService.getPrivateKey(
        activeWallet.id,
        activeAddress.path
      );

      const result = await signMessageDirect(
        message,
        privateKeyResult.hex,
        addressFormat,
        privateKeyResult.compressed
      );

      return {
        address: result.address,
        message,
        signature: result.signature,
        verification: {
          method: 'BIP-322' as const,
          format: addressFormat,
        },
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

  /** Build the standard response for xcp_requestAccounts with proof. */
  async function buildConnectResponse(origin: string, accounts: string[]) {
    const proof = accounts.length > 0 ? await generateConnectionProof(origin) : null;
    return { accounts, proof };
  }

  /**
   * Resolve a connection request: return existing accounts if already connected,
   * otherwise connect and build the response. onBeforeConnect runs only for a
   * new connection (after the already-connected check, before connect).
   */
  async function completeConnection(origin: string, onBeforeConnect?: () => Promise<void>) {
    const walletService = getWalletService();
    const connectionService = getConnectionService();

    const activeAddress = await walletService.getActiveAddress();
    const activeWallet = await walletService.getActiveWallet();
    if (!activeAddress || !activeWallet) {
      throw new Error('No active wallet or address');
    }

    if (await connectionService.hasPermission(origin)) {
      return buildConnectResponse(origin, await getAccounts(origin));
    }

    await onBeforeConnect?.();

    const accounts = await connectionService.connect(origin, activeAddress.address, activeWallet.id);
    await analytics.track('connection_established');
    return buildConnectResponse(origin, accounts);
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
                  resolve(await completeConnection(origin));
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
            const approvalService = getApprovalService();
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
                  resolve(await completeConnection(origin));
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

          // CSP analysis (warning mode only) runs just before a new connection.
          return completeConnection(origin, async () => {
            let cspHostname = origin;
            try { cspHostname = new URL(origin).hostname; } catch { /* use raw origin */ }

            try {
              const cspAnalysis = await analyzeCSP(origin);
              if (!cspAnalysis.hasCSP || cspAnalysis.warnings.length > 0) {
                console.warn('[ProviderService] Site has CSP security issues', {
                  origin: cspHostname,
                  hasCSP: cspAnalysis.hasCSP,
                  isSecure: cspAnalysis.isSecure,
                  warningCount: cspAnalysis.warnings.length,
                  warnings: cspAnalysis.warnings.slice(0, 3)
                });
              }
            } catch (error) {
              console.warn('[ProviderService] CSP analysis failed', {
                origin: cspHostname,
                error: (error as Error).message
              });
            }
          });
        }
        
        case 'xcp_accounts': {
          return getAccounts(origin);
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

          // If address specified, validate it matches active address for security
          if (address && address !== activeAddress.address) {
            throw new Error('Specified address does not match active address');
          }

          return runSignFlow({
            origin,
            method,
            params,
            approval: {
              eventPrefix: 'sign-message',
              analyticsEvent: 'message_signed',
              cancelMessage: 'User cancelled sign message request',
              timeoutMessage: 'Sign message request timeout',
              mapResult: (result) => result.signature,
            },
            cleanup: (requestId) => {
              void signMessageRequestStorage.remove(requestId);
            },
            createAndOpen: async (requestId) => {
              // Binds the request to the authorized address/wallet so signing
              // can't later use a different identity.
              await signMessageRequestStorage.store({
                id: requestId,
                origin,
                message,
                address: activeAddress.address,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              });
              chrome.runtime.sendMessage({
                type: 'NAVIGATE_TO_SIGN_MESSAGE',
                signMessageRequestId: requestId,
              }).catch(() => { /* Popup might not be open yet */ });
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
            params,
            approval: {
              eventPrefix: 'sign-tx',
              analyticsEvent: 'transaction_signed',
              cancelMessage: 'User cancelled transaction signing request',
              timeoutMessage: 'Transaction signing request timeout',
              mapResult: (result) => ({ hex: result.signedTxHex }),
            },
            cleanup: (requestId) => {
              activeSignTransactionRequests.delete(requestId);
              void signTransactionRequestStorage.remove(requestId);
            },
            createAndOpen: async (requestId) => {
              // Binds the request to the authorized address/wallet so signing
              // can't later use a different identity.
              const request = {
                id: requestId,
                origin,
                rawTxHex,
                address: activeAddress.address,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              };
              activeSignTransactionRequests.set(requestId, request);
              await signTransactionRequestStorage.store(request);
              chrome.runtime.sendMessage({
                type: 'NAVIGATE_TO_APPROVE_TRANSACTION',
                signTxRequestId: requestId,
              }).catch(() => { /* Popup might not be open yet */ });
              await openExtensionPopup(`#/requests/transaction/approve?requestId=${requestId}`);
            },
          });
        }

        case 'xcp_signPsbt': {
          const psbtParams = params?.[0];

          // Validate params structure
          if (!psbtParams || typeof psbtParams !== 'object') {
            throw new Error('PSBT parameters must be an object with hex property');
          }

          const { hex: psbtHex, signInputs, sighashTypes } = psbtParams as { hex?: string; signInputs?: Record<string, number[]>; sighashTypes?: number[] };

          if (!psbtHex) {
            throw new Error('PSBT hex is required');
          }
          if (typeof psbtHex !== 'string') {
            throw new Error('PSBT hex must be a string');
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
            params,
            approval: {
              eventPrefix: 'sign-psbt',
              analyticsEvent: 'psbt_signed',
              cancelMessage: 'User cancelled PSBT signing request',
              timeoutMessage: 'PSBT signing request timeout',
              mapResult: (result) => ({ hex: result.signedPsbtHex }),
            },
            cleanup: (requestId) => {
              activeSignPsbtRequests.delete(requestId);
              void signPsbtRequestStorage.remove(requestId);
            },
            createAndOpen: async (requestId) => {
              const request = {
                id: requestId,
                origin,
                psbtHex,
                signInputs,
                sighashTypes,
                address: activeAddress.address,
                walletId: activeWallet.id,
                timestamp: Date.now(),
              };
              activeSignPsbtRequests.set(requestId, request);
              await signPsbtRequestStorage.store(request);
              chrome.runtime.sendMessage({
                type: 'NAVIGATE_TO_APPROVE_PSBT',
                signPsbtRequestId: requestId,
              }).catch(() => { /* Popup might not be open yet */ });
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

            // Fetch token balances
            const tokenBalances = await fetchTokenBalances(activeAddress.address, {
              verbose: true
            });

            const xcpBalance = tokenBalances?.find((b: any) => b.asset === 'XCP');

            return {
              address: activeAddress.address,
              btc: {
                confirmed: btcBalance || 0,
                unconfirmed: 0,
                total: btcBalance || 0
              },
              xcp: xcpBalance?.quantity_normalized || 0
            };
          } catch (error) {
            console.error('[ProviderService] Error fetching balances:', error);
            // Return zeros if API fails
            return {
              address: activeAddress.address,
              btc: { confirmed: 0, unconfirmed: 0, total: 0 },
              xcp: 0
            };
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

          // Check for replay attempt before broadcasting
          const replayCheck = await checkReplayAttempt(
            origin,
            'xcp_broadcastTransaction',
            [signedTx]
          );

          if (replayCheck.isReplay) {
            throw new Error(`Transaction replay detected: ${replayCheck.reason}`);
          }

          // Record transaction before broadcast to prevent double-broadcast
          const tempTxid = generateRequestId('pending');
          recordTransaction(
            tempTxid,
            origin,
            'xcp_broadcastTransaction',
            [signedTx],
            { status: 'pending' }
          );

          // Broadcast using WalletService directly
          const result = await walletService.broadcastTransaction(signedTx);

          // Mark as successfully broadcasted
          if (result.txid) {
            markTransactionBroadcasted(result.txid);
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
    stopCleanupInterval();
    activeSignRequests.clear();
    activeSignPsbtRequests.clear();
    activeSignTransactionRequests.clear();
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
  createProviderService
);