/**
 * ProviderService - Refactored Web3 Provider API
 * 
 * Main interface for dApp integration, delegating all operations to focused services:
 * - ConnectionService: Permission and connection management
 * - TransactionService: Transaction composition, signing, and broadcasting
 * - BlockchainService: Blockchain data queries
 * - ApprovalService: User approval workflows
 * - WalletService: Wallet state and cryptographic operations
 */

import { defineProxyService } from '@webext-core/proxy-service';
import { getWalletService } from '@/services/walletService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getConnectionService } from '@/services/connection';
import { getApprovalService } from '@/services/approval';
import { getTransactionService } from '@/services/transaction';
import { getBlockchainService } from '@/services/blockchain';
import type { ApprovalRequest } from '@/utils/provider/approvalQueue';
import { connectionRateLimiter, transactionRateLimiter, apiRateLimiter } from '@/utils/provider/rateLimiter';
import { trackEvent } from '@/utils/fathom';
import { analyzeCSP } from '@/utils/security/cspValidation';

export interface ProviderService {
  /**
   * Handle provider requests from dApps
   */
  handleRequest: (origin: string, method: string, params?: any[], metadata?: any) => Promise<any>;
  
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
    console.debug('getAccounts called for origin:', origin);
    
    const walletService = getWalletService();
    const connectionService = getConnectionService();
    
    // Check wallet state
    const isUnlocked = await walletService.isAnyWalletUnlocked();
    if (!isUnlocked) {
      console.debug('Wallet not unlocked, returning empty array');
      return [];
    }
    
    const activeAddress = await walletService.getActiveAddress();
    if (!activeAddress) {
      console.debug('No active address, returning empty array');
      return [];
    }
    
    // Check if origin is connected
    const isConnected = await connectionService.hasPermission(origin);
    console.debug('Connection check:', { origin, isConnected });
    
    return isConnected ? [activeAddress.address] : [];
  }

  /**
   * Handle provider requests from dApps
   */
  async function handleRequest(origin: string, method: string, params: any[] = [], metadata?: any): Promise<any> {
    
    // Log request signing information if available
    if (metadata?.signature) {
      console.debug('Request signed with metadata:', {
        hasSignature: !!metadata.signature,
        hasPublicKey: !!metadata.publicKey,
        timestamp: metadata.timestamp
      });
    }
    
    try {
      // Validate parameter size to prevent memory exhaustion
      const MAX_PARAM_SIZE = 1024 * 1024; // 1MB limit
      const paramSize = JSON.stringify(params).length;
      if (paramSize > MAX_PARAM_SIZE) {
        await trackEvent('request_rejected', { _value: 1 });
        console.warn('Request parameters too large', { 
          origin: new URL(origin).hostname, 
          method, 
          paramSize, 
          maxSize: MAX_PARAM_SIZE 
        });
        throw new Error('Request parameters too large (max 1MB)');
      }
      
      // Apply rate limiting based on method type
      const isConnectionMethod = method === 'xcp_requestAccounts';
      const isTransactionMethod = method.startsWith('xcp_compose') || method.startsWith('xcp_sign') || method === 'xcp_broadcastTransaction';
      
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
      const transactionService = getTransactionService();
      const blockchainService = getBlockchainService();
      
      switch (method) {
        // ==================== Connection Methods ====================
        
        case 'xcp_requestAccounts': {
          // Check if any wallets exist first
          const wallets = await walletService.getWallets();
          if (!wallets || wallets.length === 0) {
            throw new Error('WALLET_NOT_SETUP: Please complete wallet setup first. Open the XCP Wallet extension to get started.');
          }
          
          // Check if wallet is locked
          const isUnlocked = await walletService.isAnyWalletUnlocked();
          if (!isUnlocked) {
            throw new Error('WALLET_LOCKED: Please unlock your wallet first. Click the XCP Wallet extension icon to unlock.');
          }
          
          // Get current wallet and address info
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw new Error('NO_ACTIVE_ADDRESS: No address selected. Please select an address in the wallet.');
          }
          
          const activeWallet = await walletService.getActiveWallet();
          if (!activeWallet) {
            throw new Error('NO_ACTIVE_WALLET: No wallet selected. Please select a wallet.');
          }
          
          // Check if already connected
          if (await connectionService.hasPermission(origin)) {
            return getAccounts(origin);
          }
          
          // CSP Security Analysis (warning mode only)
          try {
            const cspAnalysis = await analyzeCSP(origin);
            if (!cspAnalysis.hasCSP || cspAnalysis.warnings.length > 0) {
              console.warn('Site has CSP security issues', {
                origin: new URL(origin).hostname,
                hasCSP: cspAnalysis.hasCSP,
                isSecure: cspAnalysis.isSecure,
                warningCount: cspAnalysis.warnings.length,
                warnings: cspAnalysis.warnings.slice(0, 3)
              });
            }
          } catch (error) {
            console.warn('CSP analysis failed', {
              origin: new URL(origin).hostname,
              error: (error as Error).message
            });
          }
          
          // Request connection through ConnectionService
          const accounts = await connectionService.connect(origin, activeAddress.address, activeWallet.id);
          
          // Track successful connection
          await trackEvent('connection_established');
          
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
          
          // Emit accountsChanged event with empty array
          eventEmitterService.emitProviderEvent(origin, 'accountsChanged', []);
          
          return true;
        }
        
        // ==================== Signing Methods ====================
        
        case 'xcp_signMessage': {
          const message = params?.[0];
          const address = params?.[1];
          
          if (!message) {
            throw new Error('Message is required');
          }
          
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
          }
          
          // If no address specified, use active address
          let signingAddress = address;
          if (!signingAddress) {
            const activeAddress = await walletService.getActiveAddress();
            if (!activeAddress) {
              throw new Error('No active address');
            }
            signingAddress = activeAddress.address;
          }
          
          // Delegate to TransactionService for signing with approval
          const signature = await transactionService.signMessage(origin, message, signingAddress);
          
          // Track successful signature
          await trackEvent('message_signed');
          
          return signature;
        }
        
        case 'xcp_signTransaction': {
          const rawTx = params?.[0];
          const address = params?.[1];
          
          if (!rawTx) {
            throw new Error('Raw transaction is required');
          }
          
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
          }
          
          // Delegate to TransactionService (address is determined by the service)
          const result = await transactionService.signTransaction(origin, rawTx);
          
          // Track successful signing
          await trackEvent('transaction_signed');
          
          return {
            signedTransaction: result.signedTransaction,
            txid: result.txid
          };
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
            const btcBalance = await blockchainService.getBTCBalance(activeAddress.address);
            
            // Fetch token balances
            const tokenBalances = await blockchainService.getTokenBalances(activeAddress.address, {
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
            console.error('Error fetching balances:', error);
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
        
        // ==================== Transaction Composition Methods ====================
        
        case 'xcp_composeSend': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
          }
          
          const sendParams = params?.[0];
          if (!sendParams) {
            throw new Error('Send parameters required');
          }
          
          // Delegate to TransactionService
          return await transactionService.composeSend(origin, sendParams);
        }
        
        case 'xcp_composeOrder': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
          }
          
          const orderParams = params?.[0];
          if (!orderParams) {
            throw new Error('Order parameters required');
          }
          
          // Delegate to TransactionService
          return await transactionService.composeOrder(origin, orderParams);
        }
        
        case 'xcp_composeDispenser': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
          }
          
          const dispenserParams = params?.[0];
          if (!dispenserParams) {
            throw new Error('Dispenser parameters required');
          }
          
          // Delegate to TransactionService
          return await transactionService.composeDispenser(origin, dispenserParams);
        }
        
        case 'xcp_composeDividend': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
          }
          
          const dividendParams = params?.[0];
          if (!dividendParams) {
            throw new Error('Dividend parameters required');
          }
          
          // Delegate to TransactionService
          return await transactionService.composeDividend(origin, dividendParams);
        }
        
        case 'xcp_composeIssuance': {
          // Check if connected
          if (!await connectionService.hasPermission(origin)) {
            throw new Error('Unauthorized - not connected to wallet');
          }
          
          const issuanceParams = params?.[0];
          if (!issuanceParams) {
            throw new Error('Issuance parameters required');
          }
          
          // Delegate to TransactionService
          return await transactionService.composeIssuance(origin, issuanceParams);
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
          
          // Delegate to TransactionService
          const result = await transactionService.broadcastTransaction(origin, signedTx);
          
          // Track successful broadcast
          await trackEvent('transaction_broadcasted');
          
          return result;
        }
        
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      
    } catch (error) {
      // Log error for debugging
      console.error('Provider request failed:', {
        origin: new URL(origin).hostname,
        method,
        error: (error as Error).message
      });
      
      // Track error event (trackEvent doesn't support custom objects, just _value)
      await trackEvent('provider_error', { _value: 1 });
      
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
    
    // Emit disconnect event
    eventEmitterService.emitProviderEvent(origin, 'disconnect', {});
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
    const transactionService = getTransactionService();
    const connectionService = getConnectionService();
    const approvalService = getApprovalService();
    
    // Gather stats from all services
    const transactionStats = transactionService.getTransactionStats();
    const connectedSites = await connectionService.getConnectedWebsites();
    const approvalQueue = await approvalService.getApprovalQueue();
    
    return {
      transaction: transactionStats,
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
    console.log('Destroying ProviderService...');
    // Services are managed by ServiceRegistry and will be destroyed there
  }
  
  // Register the pending request resolver with event emitter service
  eventEmitterService.on('resolve-pending-request', ({ requestId, approved, updatedParams }: any) => {
    const approvalService = getApprovalService();
    
    // Track the approval/rejection event
    const eventName = approved ? 'request_approved' : 'request_rejected';
    trackEvent(eventName).catch(console.error);
    
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