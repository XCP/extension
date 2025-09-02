import { defineProxyService } from '@webext-core/proxy-service';
import { getWalletService } from '@/services/walletService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getKeychainSettings, updateKeychainSettings } from '@/utils/storage/settingsStorage';
import { composeTransaction } from '@/utils/blockchain/counterparty/compose';
import type { OrderOptions, SendOptions, DispenserOptions, DividendOptions, IssuanceOptions } from '@/utils/blockchain/counterparty/compose';
import { fetchTokenBalances, fetchTransactions } from '@/utils/blockchain/counterparty/api';
import type { ApprovalRequest } from '@/utils/provider/approvalQueue';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin';
import { connectionRateLimiter, transactionRateLimiter, apiRateLimiter } from '@/utils/provider/rateLimiter';
import { approvalQueue, getApprovalBadgeText } from '@/utils/provider/approvalQueue';
import { trackEvent } from '@/utils/fathom';
import { analyzePhishingRisk, shouldBlockConnection, getPhishingWarning } from '@/utils/security/phishingDetection';
import { checkReplayAttempt, withReplayPrevention, recordTransaction, markTransactionBroadcasted } from '@/utils/security/replayPrevention';
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
}

// Store pending connection requests for approval UI
const pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}>();

export function createProviderService(): ProviderService {
  /**
   * Check if an origin has permission (wallet-level connection)
   */
  async function hasPermission(origin: string): Promise<boolean> {
    const settings = await getKeychainSettings();
    return settings.connectedWebsites.includes(origin);
  }

  /**
   * Request permission from user (will trigger UI)
   */
  async function requestPermission(origin: string, address: string, walletId: string): Promise<boolean> {
    // Track the connection request
    await trackEvent('connection_request');
    
    return new Promise((resolve, reject) => {
      const requestId = `${origin}-${Date.now()}`;
      pendingRequests.set(requestId, { resolve, reject });
      
      // Add to approval queue with address info
      approvalQueue.add({
        id: requestId,
        origin,
        method: 'xcp_requestAccounts',
        params: [],
        type: 'connection',
        metadata: {
          domain: new URL(origin).hostname,
          title: 'Connection Request',
          description: 'This site wants to connect to your wallet'
        }
      });
      
      // Check if there's already an approval window open
      const currentWindow = approvalQueue.getCurrentWindow();
      
      if (currentWindow) {
        // Focus existing window
        browser.windows.update(currentWindow, { focused: true }).catch(() => {
          // Window might be closed, open a new one
          openApprovalWindow(requestId, origin).catch(error => {
            console.error('Failed to open approval window:', error);
          });
        });
      } else {
        // Open new approval window
        openApprovalWindow(requestId, origin).catch(error => {
          console.error('Failed to open approval window:', error);
        });
      }
      
      // Timeout after 5 minutes
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          approvalQueue.remove(requestId);
          reject(new Error('User denied the request'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Open approval window
   */
  async function openApprovalWindow(requestId: string, origin: string) {
    const window = await browser.windows.create({
      url: browser.runtime.getURL(`/popup.html#/provider/approval-queue`),
      type: 'popup',
      width: 350,
      height: 600,
      focused: true
    });
    
    if (window?.id) {
      approvalQueue.setCurrentWindow(window.id);
      
      // Monitor window close
      browser.windows.onRemoved.addListener(function windowCloseHandler(windowId) {
        if (windowId === window?.id) {
          approvalQueue.setCurrentWindow(null);
          browser.windows.onRemoved.removeListener(windowCloseHandler);
        }
      });
    }
    
    // Update extension badge
    updateBadge();
  }

  /**
   * Update extension badge with pending approval count
   */
  function updateBadge() {
    const text = getApprovalBadgeText();
    if (browser.action) {
      browser.action.setBadgeText({ text });
      browser.action.setBadgeBackgroundColor({ color: text ? '#EF4444' : '#000000' });
    }
  }

  /**
   * Get accounts for connected origin
   */
  async function getAccounts(origin: string): Promise<string[]> {
    console.debug('getAccounts called for origin:', origin);
    const walletService = getWalletService();
    const isUnlocked = await walletService.isAnyWalletUnlocked();
    console.debug('Wallet unlocked:', isUnlocked);
    
    if (!isUnlocked) {
      console.debug('Wallet not unlocked, returning empty array');
      return [];
    }
    
    const activeAddress = await walletService.getActiveAddress();
    console.debug('Active address:', activeAddress);
    if (!activeAddress) {
      console.debug('No active address, returning empty array');
      return [];
    }
    
    // Check if origin is connected at wallet level
    const isConnected = await hasPermission(origin);
    console.debug('Connection check:', { origin, isConnected });
    const accounts = isConnected ? [activeAddress.address] : [];
    console.debug('Returning accounts:', accounts);
    return accounts;
  }

  /**
   * Handle provider requests from dApps
   */
  async function handleRequest(origin: string, method: string, params: any[] = [], metadata?: any): Promise<any> {
    console.log('Provider request:', { origin, method, params });
    
    // Log request signing information if available
    if (metadata?.signature) {
      console.debug('Request signed with metadata:', {
        hasSignature: !!metadata.signature,
        hasPublicKey: !!metadata.publicKey,
        timestamp: metadata.timestamp
      });
    }
    
    try {
    
    // SECURITY: Check for phishing domains first
    if (await shouldBlockConnection(origin)) {
      const warning = getPhishingWarning(origin);
      console.warn('Blocked phishing domain:', { origin: new URL(origin).hostname, warning });
      throw new Error('Connection blocked: Suspicious domain detected');
    }
    
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
    
    const walletService = getWalletService();
    
    switch (method) {
      // Connection methods
      case 'xcp_requestAccounts': {
        // Check if any wallets exist first
        const wallets = await walletService.getWallets();
        if (!wallets || wallets.length === 0) {
          // User hasn't completed onboarding yet
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
        
        // Check if already connected to wallet
        if (await hasPermission(origin)) {
          return getAccounts(origin);
        }
        
        // CSP Security Analysis (warning mode only - doesn't block connections)
        try {
          const cspAnalysis = await analyzeCSP(origin);
          if (!cspAnalysis.hasCSP || cspAnalysis.warnings.length > 0) {
            console.warn('Site has CSP security issues', {
              origin: new URL(origin).hostname,
              hasCSP: cspAnalysis.hasCSP,
              isSecure: cspAnalysis.isSecure,
              warningCount: cspAnalysis.warnings.length,
              warnings: cspAnalysis.warnings.slice(0, 3) // Log first 3 warnings
            });
          }
        } catch (error) {
          // CSP analysis failed, but don't block the connection
          console.warn('CSP analysis failed', {
            origin: new URL(origin).hostname,
            error: (error as Error).message
          });
        }
        
        // Request permission from user for this specific address
        const approved = await requestPermission(origin, activeAddress.address, activeWallet.id);
        
        console.debug('Permission request result:', { approved, origin, address: activeAddress.address });
        
        if (approved) {
          // Track the successful connection
          await trackEvent('connection_established');
          
          // Add origin to connected websites
          console.debug('Adding origin to connectedWebsites');
          const settings = await getKeychainSettings();
          if (!settings.connectedWebsites.includes(origin)) {
            await updateKeychainSettings({
              connectedWebsites: [...settings.connectedWebsites, origin]
            });
          }
          
          console.debug('Connection saved, getting accounts');
          const accounts = await getAccounts(origin);
          console.debug('Accounts to return:', accounts);
          return accounts;
        } else {
          throw new Error('User denied the request');
        }
      }
      
      case 'xcp_accounts': {
        return getAccounts(origin);
      }
      
      // Chain ID (we use 0 for Counterparty/Bitcoin)
      case 'xcp_chainId': {
        return '0x0'; // Bitcoin mainnet
      }
      
      // Network version
      case 'xcp_getNetwork': {
        return 'mainnet'; // Bitcoin mainnet
      }
      
      // Disconnect from site
      case 'xcp_disconnect': {
        // Remove origin from connected websites
        const settings = await getKeychainSettings();
        const updatedSites = settings.connectedWebsites.filter(site => site !== origin);
        await updateKeychainSettings({
          connectedWebsites: updatedSites
        });
        
        // Emit accountsChanged event with empty array
        // Use event emitter service instead of global variable
        eventEmitterService.emitProviderEvent('emit-provider-event', { 
          origin, 
          event: 'accountsChanged', 
          data: [] 
        });
        
        return true;
      }
      
      // Sign message
      case 'xcp_signMessage': {
        const message = params?.[0];
        const address = params?.[1];
        
        if (!message || !address) {
          throw new Error('Message and address required');
        }
        
        // Check if connected to wallet
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized - not connected to wallet');
        }
        
        // Open approval popup for message signing
        return new Promise((resolve, reject) => {
          const requestId = `sign-msg-${origin}-${Date.now()}`;
          pendingRequests.set(requestId, { resolve, reject });
          
          // Add to approval queue with address info
          approvalQueue.add({
            id: requestId,
            origin,
            method: 'xcp_signMessage',
            params: [message, address],
            type: 'signature',
            metadata: {
              domain: new URL(origin).hostname,
              title: 'Sign Message',
              description: `Sign a message with address ${address}`
            }
          });
          
          // Open message signing approval popup
          openApprovalWindow(requestId, origin).catch(error => {
            console.error('Failed to open approval window:', error);
          });
          
          // Timeout after 5 minutes
          setTimeout(() => {
            if (pendingRequests.has(requestId)) {
              pendingRequests.delete(requestId);
              reject(new Error('User denied the request'));
            }
          }, 5 * 60 * 1000);
        }).then(async (approved) => {
          if (!approved) {
            throw new Error('User denied the request');
          }
          
          // Sign the message using wallet service
          const walletService = getWalletService();
          const result = await walletService.signMessage(message, address);
          
          // Track successful signature
          await trackEvent('message_signed');
          
          return result.signature;
        });
      }
      
      // Get balances - Returns only BTC and XCP balances for simplicity
      // DApps can fetch full token balances themselves using the address
      case 'xcp_getBalances': {
        const activeAddress = await walletService.getActiveAddress();
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        // Check if connected to wallet
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized - not connected to wallet');
        }
        
        try {
          // Fetch BTC balance
          const btcBalance = await fetchBTCBalance(activeAddress.address);
          
          // Fetch only XCP balance to keep it simple
          const xcpBalance = await fetchTokenBalances(activeAddress.address, {
            verbose: true,
            limit: 1
          });
          
          // Return simplified balance info
          return {
            address: activeAddress.address,
            btc: {
              confirmed: btcBalance || 0,
              unconfirmed: 0,  // fetchBTCBalance doesn't separate confirmed/unconfirmed
              total: btcBalance || 0
            },
            xcp: xcpBalance?.find((b: any) => b.asset === 'XCP')?.quantity_normalized || 0
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
      
      // Get assets - Not supported, dApps should use Counterparty API directly
      case 'xcp_getAssets': {
        throw new Error('Method xcp_getAssets is not supported. Please use the Counterparty API directly with the connected address.');
      }
      
      // Get transaction history
      case 'xcp_getHistory': {
        const activeAddress = await walletService.getActiveAddress();
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        // Check if connected to wallet
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized - not connected to wallet');
        }
        
        // For privacy, we don't allow reading transaction history
        // DApps should use the Counterparty API directly
        throw new Error('Permission denied - transaction history not available through provider');
      }
      
      // Compose transaction (for Phase 2)
      case 'xcp_composeOrder': {
        const activeAddress = await walletService.getActiveAddress();
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        // Check if connected to wallet
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized - not connected to wallet');
        }
        
        // Extract order parameters
        const orderParams = params?.[0];
        if (!orderParams) {
          throw new Error('Order parameters required');
        }
        
        // Request user approval for the compose operation
        return new Promise((resolve, reject) => {
          const requestId = `compose-order-${origin}-${Date.now()}`;
          pendingRequests.set(requestId, { resolve, reject });
          
          // Prepare approval parameters
          const approvalParams = {
            type: 'order',
            give_asset: orderParams.give_asset,
            give_quantity: orderParams.give_quantity,
            get_asset: orderParams.get_asset,
            get_quantity: orderParams.get_quantity,
            expiration: orderParams.expiration || 1000,
            fee_rate: orderParams.fee_rate || 1
          };
          
          // Add to approval queue
          approvalQueue.add({
            id: requestId,
            origin,
            method: 'xcp_composeOrder',
            params: approvalParams,
            type: 'compose',
            metadata: {
              domain: new URL(origin).hostname,
              title: 'Create DEX Order',
              description: `Trade ${orderParams.give_asset} for ${orderParams.get_asset}`
            }
          });
          
          // Check if there's already an approval window open
          const currentWindow = approvalQueue.getCurrentWindow();
          
          if (currentWindow) {
            // Focus existing window
            browser.windows.update(currentWindow, { focused: true }).catch(() => {
              openApprovalWindow(requestId, origin).catch(error => {
                console.error('Failed to open approval window:', error);
              });
            });
          } else {
            // Open new approval window
            openApprovalWindow(requestId, origin).catch(error => {
              console.error('Failed to open approval window:', error);
            });
          }
          
          // Timeout after 5 minutes
          setTimeout(() => {
            if (pendingRequests.has(requestId)) {
              pendingRequests.delete(requestId);
              approvalQueue.remove(requestId);
              reject(new Error('User denied the request'));
            }
          }, 5 * 60 * 1000);
        }).then(async (result: any) => {
          // Check if result is an object with updatedParams or just a boolean
          const approved = typeof result === 'object' && result !== null ? result.approved : result;
          const finalParams = typeof result === 'object' && result !== null && result.updatedParams ? 
            { ...orderParams, ...result.updatedParams } : orderParams;
          
          if (!approved) {
            throw new Error('User denied the request');
          }
          
          // User approved - compose the transaction with potentially updated params
          console.log('Composing order with final params:', {
            originalParams: orderParams,
            updatedParams: result.updatedParams,
            finalParams,
            address: activeAddress.address
          });
          
          const composeResult = await composeTransaction(
            'order',
            {
              give_asset: finalParams.give_asset,
              give_quantity: finalParams.give_quantity,
              get_asset: finalParams.get_asset,
              get_quantity: finalParams.get_quantity,
              expiration: finalParams.expiration || 1000,
            },
            activeAddress.address,
            finalParams.fee_rate || 1,
            finalParams.encoding
          );
          
          return {
            rawtransaction: composeResult.result.rawtransaction,
            psbt: composeResult.result.psbt,
            fee: composeResult.result.btc_fee,
            params: composeResult.result.params
          };
        });
      }
      
      case 'xcp_composeSend': {
        const activeAddress = await walletService.getActiveAddress();
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        // Check if connected to wallet
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized - not connected to wallet');
        }
        
        // Extract send parameters
        const sendParams = params?.[0];
        if (!sendParams) {
          throw new Error('Send parameters required');
        }
        
        // Use replay prevention for compose operations
        return withReplayPrevention(
          origin,
          method,
          params,
          async () => {
            // Compose the send transaction
            const composeResult = await composeTransaction(
              'send',
              {
                destination: sendParams.destination,
                asset: sendParams.asset,
                quantity: sendParams.quantity,
                memo: sendParams.memo || null,
                memo_is_hex: sendParams.memo_is_hex || false,
              },
              activeAddress.address,
              sendParams.fee_rate || 1, // Default to 1 sat/vbyte
              sendParams.encoding
            );
            
            return {
              rawtransaction: composeResult.result.rawtransaction,
              psbt: composeResult.result.psbt,
              fee: composeResult.result.btc_fee,
              params: composeResult.result.params
            };
          },
          {
            generateIdempotencyKey: true,
            idempotencyTtlMinutes: 5 // Cache compose results for 5 minutes
          }
        );
      }
      
      // Compose dispenser
      case 'xcp_composeDispenser': {
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized');
        }
        
        const walletService = getWalletService();
        const activeAddress = await walletService.getLastActiveAddress();
        
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        const dispenserParams = params?.[0];
        if (!dispenserParams) {
          throw new Error('Dispenser parameters required');
        }
        
        const composeResult = await composeTransaction(
          'dispenser',
          {
            asset: dispenserParams.asset,
            give_quantity: dispenserParams.give_quantity,
            escrow_quantity: dispenserParams.escrow_quantity,
            mainchainrate: dispenserParams.mainchainrate,
            status: dispenserParams.status || '0',
          },
          activeAddress,
          dispenserParams.fee_rate || 1,
          dispenserParams.encoding
        );
        
        return {
          rawtransaction: composeResult.result.rawtransaction,
          psbt: composeResult.result.psbt,
          fee: composeResult.result.btc_fee,
          params: composeResult.result.params
        };
      }
      
      // Compose dividend
      case 'xcp_composeDividend': {
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized');
        }
        
        const walletService = getWalletService();
        const activeAddress = await walletService.getLastActiveAddress();
        
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        const dividendParams = params?.[0];
        if (!dividendParams) {
          throw new Error('Dividend parameters required');
        }
        
        const composeResult = await composeTransaction(
          'dividend',
          {
            asset: dividendParams.asset,
            dividend_asset: dividendParams.dividend_asset,
            quantity_per_unit: dividendParams.quantity_per_unit,
          },
          activeAddress,
          dividendParams.fee_rate || 1,
          dividendParams.encoding
        );
        
        return {
          rawtransaction: composeResult.result.rawtransaction,
          psbt: composeResult.result.psbt,
          fee: composeResult.result.btc_fee,
          params: composeResult.result.params
        };
      }
      
      // Compose issuance
      case 'xcp_composeIssuance': {
        const activeAddress = await walletService.getActiveAddress();
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        // Check if connected to wallet
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized - not connected to wallet');
        }
        
        const issuanceParams = params?.[0];
        if (!issuanceParams) {
          throw new Error('Issuance parameters required');
        }
        
        const composeResult = await composeTransaction(
          'issuance',
          {
            asset: issuanceParams.asset,
            quantity: issuanceParams.quantity,
            divisible: issuanceParams.divisible,
            lock: issuanceParams.lock || false,
            reset: issuanceParams.reset || false,
            description: issuanceParams.description,
            transfer_destination: issuanceParams.transfer_destination,
          },
          activeAddress.address,
          issuanceParams.fee_rate || 1,
          issuanceParams.encoding
        );
        
        return {
          rawtransaction: composeResult.result.rawtransaction,
          psbt: composeResult.result.psbt,
          fee: composeResult.result.btc_fee,
          params: composeResult.result.params
        };
      }
      
      // Sign transaction (for Phase 2)
      case 'xcp_signTransaction': {
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized');
        }
        
        const walletService = getWalletService();
        const activeAddress = await walletService.getLastActiveAddress();
        
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        // Get the raw transaction to sign
        const rawTx = params?.[0];
        if (!rawTx) {
          throw new Error('Transaction required');
        }
        
        // Open approval popup for signing
        return new Promise((resolve, reject) => {
          const requestId = `sign-${origin}-${Date.now()}`;
          pendingRequests.set(requestId, { resolve, reject });
          
          // Open signing approval popup
          browser.windows.create({
            url: browser.runtime.getURL(`/popup.html#/provider/approve-transaction?origin=${encodeURIComponent(origin)}&requestId=${requestId}&tx=${encodeURIComponent(rawTx)}`),
            type: 'popup',
            width: 350,
            height: 600,
            focused: true
          });
          
          // Timeout after 5 minutes
          setTimeout(() => {
            if (pendingRequests.has(requestId)) {
              pendingRequests.delete(requestId);
              reject(new Error('User denied the request'));
            }
          }, 5 * 60 * 1000);
        }).then(async (approved) => {
          if (!approved) {
            throw new Error('User denied the request');
          }
          
          // Sign the transaction
          const signedTx = await walletService.signTransaction(rawTx as string, activeAddress);
          return { signedTransaction: signedTx };
        });
      }
      
      // Broadcast transaction (for Phase 2)
      case 'xcp_broadcastTransaction': {
        const activeAddress = await walletService.getActiveAddress();
        if (!activeAddress) {
          throw new Error('No active address');
        }
        
        // Check if connected to wallet
        if (!await hasPermission(origin)) {
          throw new Error('Unauthorized - not connected to wallet');
        }
        
        // Get the signed transaction to broadcast
        const signedTx = params?.[0];
        if (!signedTx) {
          throw new Error('Signed transaction required');
        }
        
        // Use replay prevention wrapper
        return withReplayPrevention(
          origin,
          method,
          params,
          async () => {
            // Broadcast the transaction
            const result = await walletService.broadcastTransaction(signedTx);
            
            // Record the transaction to prevent replay
            recordTransaction(
              result.txid,
              origin,
              method,
              params,
              { status: 'pending' }
            );
            
            // Mark as broadcasted after successful broadcast
            markTransactionBroadcasted(result.txid);
            
            return {
              txid: result.txid,
              fees: result.fees
            };
          },
          {
            generateIdempotencyKey: true,
            idempotencyTtlMinutes: 10 // Cache broadcast results for 10 minutes
          }
        );
      }
      
      default:
        console.error(`Unsupported method: ${method}`, { 
          origin: new URL(origin).hostname, 
          method, 
          paramCount: params.length 
        });
        throw new Error(`Method ${method} is not supported`);
    }
  } catch (error) {
    // Log provider errors with context
    console.error('Provider error:', error, {
      origin: new URL(origin).hostname,
      method,
      paramCount: params.length,
      errorType: (error as Error).constructor.name
    });
    
    // Re-throw the error to maintain existing behavior
    throw error;
  }
  }

  /**
   * Check if origin is connected to the current address
   */
  async function isConnected(origin: string): Promise<boolean> {
    return hasPermission(origin);
  }

  /**
   * Disconnect an origin from wallet
   */
  async function disconnect(origin: string): Promise<void> {
    // Remove from connected websites
    const settings = await getKeychainSettings();
    const updatedSites = settings.connectedWebsites.filter(site => site !== origin);
    await updateKeychainSettings({
      connectedWebsites: updatedSites
    });
    
    // Track the disconnect event
    await trackEvent('connection_disconnected', {
      _value: 1
    });
    
    // Emit disconnect event to content script
    // Use event emitter service instead of global variable
    eventEmitterService.emitProviderEvent('emit-provider-event', { 
      origin, 
      event: 'accountsChanged', 
      data: [] 
    });
    eventEmitterService.emitProviderEvent('emit-provider-event', { 
      origin, 
      event: 'disconnect', 
      data: {} 
    });
  }

  /**
   * Get all pending approval requests
   */
  async function getApprovalQueue(): Promise<ApprovalRequest[]> {
    return approvalQueue.getAll();
  }

  /**
   * Remove an approval request
   */
  async function removeApprovalRequest(id: string): Promise<boolean> {
    return approvalQueue.remove(id);
  }

  // Register the pending request resolver with event emitter service
  // This allows the background script to resolve requests without global variables
  eventEmitterService.on('resolve-pending-request', ({ requestId, approved, updatedParams }: any) => {
    resolvePendingRequest(requestId, approved, updatedParams);
  });

  return {
    handleRequest,
    isConnected,
    disconnect,
    getApprovalQueue,
    removeApprovalRequest
  };
}

// Function for resolving pending requests - called via event emitter service
function resolvePendingRequest(requestId: string, approved: boolean, updatedParams?: any) {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    // Get the request details for tracking
    const allRequests = approvalQueue.getAll();
    const request = allRequests.find(req => req.id === requestId);
    
    // Track the approval/rejection event
    if (request) {
      const hostname = new URL(request.origin).hostname;
      const eventName = approved ? 'request_approved' : 'request_rejected';
      const eventData: any = { 
        origin: hostname,
        method: request.method,
        type: request.type 
      };
      
      // Add address info if available (from params for connection requests)
      if (request.params?.[0]?.address) {
        const addr = request.params[0].address;
        eventData.address = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      }
      
      trackEvent(eventName, eventData).catch(console.error);
    }
    
    pendingRequests.delete(requestId);
    
    // Remove from queue
    approvalQueue.remove(requestId);
    
    // Update badge
    updateBadge();
    
    if (approved) {
      // If there are updated params, pass them along with the approval
      pending.resolve(updatedParams ? { approved: true, updatedParams } : true);
    } else {
      pending.reject(new Error('User denied the request'));
    }
  }
}

// Helper function for badge updates (needs to be accessible)
function updateBadge() {
  const text = getApprovalBadgeText();
  if (browser.action) {
    browser.action.setBadgeText({ text });
    browser.action.setBadgeBackgroundColor({ color: text ? '#EF4444' : '#000000' });
  }
}

// Register the resolver with the event emitter service
// The pending request resolution now happens through the event emitter service
// which is accessed directly when needed instead of using global variables

export const [registerProviderService, getProviderService] = defineProxyService(
  'ProviderService',
  createProviderService
);