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
import type { ApprovalRequest } from '@/utils/provider/approvalQueue';
import { connectionRateLimiter, transactionRateLimiter, apiRateLimiter } from '@/utils/provider/rateLimiter';
import { analytics } from '@/utils/fathom';
import { analyzeCSP } from '@/utils/security/cspValidation';
import { signMessageRequestStorage } from '@/utils/storage/signMessageRequestStorage';
import { signPsbtRequestStorage } from '@/utils/storage/signPsbtRequestStorage';
import { signTransactionRequestStorage } from '@/utils/storage/signTransactionRequestStorage';
import { getUpdateService } from '@/services/updateService';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin/balance';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';
import { checkReplayAttempt, recordTransaction, markTransactionBroadcasted } from '@/utils/security/replayPrevention';
import { openExtensionPopup } from '@/utils/popup';
import { generateRequestId } from '@/utils/id';

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
   * Get all pending approval requests
   */
  getApprovalQueue: () => Promise<ApprovalRequest[]>;
  
  /**
   * Remove an approval request
   */
  removeApprovalRequest: (id: string) => Promise<boolean>;
  
  /**
   * Get statistics about pending requests
   */
  getRequestStats: () => Promise<any>;
  
  /**
   * Cleanup resources and destroy the service
   */
  destroy: () => Promise<void>;
}

export function createProviderService(): ProviderService {
  /**
   * Get accounts for connected origin
   */
  async function getAccounts(origin: string): Promise<string[]> {
    console.debug('[ProviderService] getAccounts called for origin:', origin);

    const walletService = getWalletService();
    const connectionService = getConnectionService();

    // Check wallet state
    const isUnlocked = await walletService.isAnyWalletUnlocked();
    if (!isUnlocked) {
      console.debug('[ProviderService] Wallet not unlocked, returning empty array');
      return [];
    }

    const activeAddress = await walletService.getActiveAddress();
    if (!activeAddress) {
      console.debug('[ProviderService] No active address, returning empty array');
      return [];
    }

    // Check if origin is connected
    const isConnected = await connectionService.hasPermission(origin);
    console.debug('[ProviderService] Connection check:', { origin, isConnected });

    return isConnected ? [activeAddress.address] : [];
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
        await analytics.track('request_rejected', { value: '1' });
        throw new Error('Request parameters cannot be serialized');
      }
      if (paramSize > MAX_PARAM_SIZE) {
        await analytics.track('request_rejected', { value: '1' });
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
          // Check if any wallets exist first
          const wallets = await walletService.getWallets();
          if (!wallets || wallets.length === 0) {
            // Open popup for wallet setup
            await openExtensionPopup();
            throw new Error('Please complete wallet setup first');
          }

          // Check if wallet is locked
          const isUnlocked = await walletService.isAnyWalletUnlocked();
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
                const nowUnlocked = await walletService.isAnyWalletUnlocked();
                if (!nowUnlocked) {
                  reject(new Error('Wallet still locked after unlock attempt'));
                  return;
                }

                // Continue with connection flow
                try {
                  const activeAddress = await walletService.getActiveAddress();
                  const activeWallet = await walletService.getActiveWallet();

                  if (!activeAddress || !activeWallet) {
                    reject(new Error('No active wallet or address after unlock'));
                    return;
                  }

                  // Check if already connected
                  if (await connectionService.hasPermission(origin)) {
                    resolve(getAccounts(origin));
                    return;
                  }

                  // Request connection
                  const accounts = await connectionService.connect(origin, activeAddress.address, activeWallet.id);
                  await analytics.track('connection_established');
                  resolve(accounts);
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

          // Get current wallet and address info
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw new Error('No address selected');
          }

          const activeWallet = await walletService.getActiveWallet();
          if (!activeWallet) {
            throw new Error('No wallet selected');
          }

          // Check if already connected
          if (await connectionService.hasPermission(origin)) {
            return getAccounts(origin);
          }
          
          // CSP Security Analysis (warning mode only)
          // Safely extract hostname for logging
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
          
          // Request connection through ConnectionService
          const accounts = await connectionService.connect(origin, activeAddress.address, activeWallet.id);
          
          // Track successful connection
          await analytics.track('connection_established');
          
          return accounts;
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
            throw new Error('Unauthorized - not connected to wallet');
          }

          // Get active address for the request
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw new Error('No active address');
          }

          // If address specified, validate it matches active address for security
          if (address && address !== activeAddress.address) {
            throw new Error('Specified address does not match active address');
          }

          // Store the sign message request for the popup to retrieve
          const signMessageRequestId = generateRequestId('sign-message');
          await signMessageRequestStorage.store({
            id: signMessageRequestId,
            origin,
            message,
            timestamp: Date.now()
          });

          // Send message to popup to navigate to sign message form
          chrome.runtime.sendMessage({
            type: 'NAVIGATE_TO_SIGN_MESSAGE',
            signMessageRequestId
          }).catch(() => {
            // Popup might not be open yet
          });

          // Open popup at the sign message form
          await openExtensionPopup(`#/actions/sign-message?signMessageRequestId=${signMessageRequestId}`);

          // Track as critical operation to prevent extension updates during sign message
          const updateService = getUpdateService();
          updateService.registerCriticalOperation(`sign-message-${signMessageRequestId}`);

          // Return a promise that will resolve when the user completes the sign message flow
          return new Promise((resolve, reject) => {
            let settled = false;
            let timeout: ReturnType<typeof setTimeout>;

            // Centralized cleanup - called on any exit path
            const cleanup = () => {
              if (timeout) clearTimeout(timeout);
              updateService.unregisterCriticalOperation(`sign-message-${signMessageRequestId}`);
              eventEmitterService.off(`sign-message-complete-${signMessageRequestId}`, handleComplete);
              eventEmitterService.off(`sign-message-cancel-${signMessageRequestId}`, handleCancel);
            };

            const handleComplete = (result: any) => {
              if (settled) return;
              settled = true;
              cleanup();
              analytics.track('message_signed');
              resolve(result.signature); // Return just the signature for compatibility
            };

            const handleCancel = () => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('User cancelled sign message request'));
            };

            timeout = setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('Sign message request timeout'));
            }, 10 * 60 * 1000); // 10 minute timeout

            // Listen for completion events
            eventEmitterService.on(`sign-message-complete-${signMessageRequestId}`, handleComplete);
            eventEmitterService.on(`sign-message-cancel-${signMessageRequestId}`, handleCancel);
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
            throw new Error('Unauthorized - not connected to wallet');
          }

          // Get active address for the request
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw new Error('No active address');
          }

          // Store the sign transaction request
          const signTxRequestId = generateRequestId('sign-tx');
          const request = {
            id: signTxRequestId,
            origin,
            rawTxHex,
            timestamp: Date.now()
          };

          // Store in memory for fast access
          activeSignTransactionRequests.set(signTxRequestId, request);

          // Also store in chrome.storage as backup
          await signTransactionRequestStorage.store(request);

          // Send message to popup to navigate to approve transaction page
          chrome.runtime.sendMessage({
            type: 'NAVIGATE_TO_APPROVE_TRANSACTION',
            signTxRequestId
          }).catch(() => {
            // Popup might not be open yet
          });

          // Open popup at the approve transaction page
          await openExtensionPopup(`#/provider/approve-transaction?requestId=${signTxRequestId}`);

          // Track as critical operation to prevent extension updates during transaction signing
          const updateService = getUpdateService();
          updateService.registerCriticalOperation(`sign-tx-${signTxRequestId}`);

          // Return a promise that will resolve when the user completes the sign transaction flow
          return new Promise((resolve, reject) => {
            let settled = false;
            let timeout: ReturnType<typeof setTimeout>;

            // Centralized cleanup - called on any exit path
            const cleanup = () => {
              if (timeout) clearTimeout(timeout);
              activeSignTransactionRequests.delete(signTxRequestId);
              signTransactionRequestStorage.remove(signTxRequestId);
              updateService.unregisterCriticalOperation(`sign-tx-${signTxRequestId}`);
              eventEmitterService.off(`sign-tx-complete-${signTxRequestId}`, handleComplete);
              eventEmitterService.off(`sign-tx-cancel-${signTxRequestId}`, handleCancel);
            };

            const handleComplete = (result: any) => {
              if (settled) return;
              settled = true;
              cleanup();
              analytics.track('transaction_signed');
              resolve({ hex: result.signedTxHex }); // Return signed transaction hex
            };

            const handleCancel = () => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('User cancelled transaction signing request'));
            };

            timeout = setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('Transaction signing request timeout'));
            }, 10 * 60 * 1000); // 10 minute timeout

            // Listen for completion events
            eventEmitterService.on(`sign-tx-complete-${signTxRequestId}`, handleComplete);
            eventEmitterService.on(`sign-tx-cancel-${signTxRequestId}`, handleCancel);
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
            throw new Error('Unauthorized - not connected to wallet');
          }

          // Get active address for the request
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw new Error('No active address');
          }

          // Store the sign PSBT request
          const signPsbtRequestId = generateRequestId('sign-psbt');
          const request = {
            id: signPsbtRequestId,
            origin,
            psbtHex,
            signInputs,
            sighashTypes,
            timestamp: Date.now()
          };

          // Store in memory for fast access
          activeSignPsbtRequests.set(signPsbtRequestId, request);

          // Also store in chrome.storage as backup
          await signPsbtRequestStorage.store(request);

          // Send message to popup to navigate to approve PSBT page
          chrome.runtime.sendMessage({
            type: 'NAVIGATE_TO_APPROVE_PSBT',
            signPsbtRequestId
          }).catch(() => {
            // Popup might not be open yet
          });

          // Open popup at the approve PSBT page
          await openExtensionPopup(`#/provider/approve-psbt?requestId=${signPsbtRequestId}`);

          // Track as critical operation to prevent extension updates during PSBT signing
          const updateService = getUpdateService();
          updateService.registerCriticalOperation(`sign-psbt-${signPsbtRequestId}`);

          // Return a promise that will resolve when the user completes the sign PSBT flow
          return new Promise((resolve, reject) => {
            let settled = false;
            let timeout: ReturnType<typeof setTimeout>;

            // Centralized cleanup - called on any exit path
            const cleanup = () => {
              if (timeout) clearTimeout(timeout);
              activeSignPsbtRequests.delete(signPsbtRequestId);
              signPsbtRequestStorage.remove(signPsbtRequestId);
              updateService.unregisterCriticalOperation(`sign-psbt-${signPsbtRequestId}`);
              eventEmitterService.off(`sign-psbt-complete-${signPsbtRequestId}`, handleComplete);
              eventEmitterService.off(`sign-psbt-cancel-${signPsbtRequestId}`, handleCancel);
            };

            const handleComplete = (result: any) => {
              if (settled) return;
              settled = true;
              cleanup();
              analytics.track('psbt_signed');
              resolve({ hex: result.signedPsbtHex }); // Return signed PSBT hex
            };

            const handleCancel = () => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('User cancelled PSBT signing request'));
            };

            timeout = setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('PSBT signing request timeout'));
            }, 10 * 60 * 1000); // 10 minute timeout

            // Listen for completion events
            eventEmitterService.on(`sign-psbt-complete-${signPsbtRequestId}`, handleComplete);
            eventEmitterService.on(`sign-psbt-cancel-${signPsbtRequestId}`, handleCancel);
          });
        }

        // ==================== Blockchain Query Methods ====================
        
        case 'xcp_getBalances': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
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
          throw new Error('Method xcp_getAssets is not supported. Please use the Counterparty API directly with the connected address.');
        }
        
        case 'xcp_getHistory': {
          // For privacy, we don't allow reading transaction history
          throw new Error('Permission denied - transaction history not available through provider');
        }

        // ==================== Transaction Broadcasting ====================
        
        case 'xcp_broadcastTransaction': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
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
          throw new Error(`Unsupported method: ${method}`);
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

      // Track error event (trackEvent doesn't support custom objects, just _value)
      await analytics.track('provider_error', { value: '1' });

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
   * Get all pending approval requests
   */
  async function getApprovalQueue(): Promise<ApprovalRequest[]> {
    const approvalService = getApprovalService();
    return await approvalService.getApprovalQueue();
  }
  
  /**
   * Remove an approval request
   */
  async function removeApprovalRequest(id: string): Promise<boolean> {
    const approvalService = getApprovalService();
    return await approvalService.removeApprovalRequest(id);
  }
  
  /**
   * Get statistics about pending requests
   */
  async function getRequestStats(): Promise<any> {
    const connectionService = getConnectionService();
    const approvalService = getApprovalService();
    
    // Gather stats from all services
    const connectedSites = await connectionService.getConnectedWebsites();
    const approvalQueue = await approvalService.getApprovalQueue();

    return {
      connections: {
        connectedSites: connectedSites.length,
        sites: connectedSites
      },
      approvals: {
        pending: approvalQueue.length,
        queue: approvalQueue
      }
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
  
  // Register the pending request resolver with event emitter service
  eventEmitterService.on('resolve-pending-request', ({ requestId, approved, updatedParams }: any) => {
    const approvalService = getApprovalService();
    
    // Track the approval/rejection event
    const eventName = approved ? 'request_approved' : 'request_rejected';
    analytics.track(eventName);
    
    // Resolve the approval
    approvalService.resolveApproval(requestId, {
      approved,
      updatedParams
    });
  });
  
  return {
    handleRequest,
    isConnected,
    disconnect,
    getApprovalQueue,
    removeApprovalRequest,
    getRequestStats,
    destroy
  };
}

// Register proxy service for cross-context communication
export const [registerProviderService, getProviderService] = defineProxyService(
  'ProviderService',
  createProviderService
);