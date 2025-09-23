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
import { getConnectionService } from '@/services/connection';
import { getApprovalService } from '@/services/approval';
import { approvalQueue } from '@/utils/provider/approvalQueue';
import type { ApprovalRequest } from '@/utils/provider/approvalQueue';
import { connectionRateLimiter, transactionRateLimiter, apiRateLimiter } from '@/utils/provider/rateLimiter';
import { analytics } from '@/utils/fathom';
import { analyzeCSP } from '@/utils/security/cspValidation';
import { composeRequestStorage } from '@/utils/storage/composeRequestStorage';
import { signMessageRequestStorage } from '@/utils/storage/signMessageRequestStorage';
import { getKeychainSettings, updateKeychainSettings } from '@/utils/storage/settingsStorage';
import { getUpdateService } from '@/services/updateService';
import type {
  SendOptions, OrderOptions, DispenserOptions, DispenseOptions, DividendOptions, IssuanceOptions,
  SweepOptions, BTCPayOptions, CancelOptions, BetOptions, BroadcastOptions, FairminterOptions,
  FairmintOptions, AttachOptions, DetachOptions, MoveOptions, DestroyOptions
} from '@/utils/blockchain/counterparty/compose';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin/balance';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';
import { checkReplayAttempt, recordTransaction, markTransactionBroadcasted } from '@/utils/security/replayPrevention';

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
    console.debug('getAccounts: wallet unlocked =', isUnlocked);
    if (!isUnlocked) {
      console.debug('Wallet not unlocked, returning empty array');
      return [];
    }

    const activeAddress = await walletService.getActiveAddress();
    console.debug('getAccounts: activeAddress =', activeAddress);
    if (!activeAddress) {
      console.debug('No active address, returning empty array');
      return [];
    }

    // Check if origin is connected
    const isConnected = await connectionService.hasPermission(origin);
    console.debug('getAccounts: Connection check:', { origin, isConnected });

    const result = isConnected ? [activeAddress.address] : [];
    console.debug('getAccounts: returning', result);
    return result;
  }

  /**
   * Helper function for handling compose requests with UI routing
   * Uses proper typing from compose.ts for parameter validation
   */
  async function handleComposeRequest<T = any>(
    origin: string,
    params: any[],
    composeType: string,
    errorMessage: string,
    routePath: string,
    validator?: (params: any) => params is T
  ): Promise<any> {
    // Check if connected FIRST before parameter validation
    const connectionService = getConnectionService();
    if (!await connectionService.hasPermission(origin)) {
      throw new Error('Unauthorized - not connected to wallet');
    }

    const requestParams = params?.[0];
    if (!requestParams) {
      throw new Error(errorMessage);
    }

    // Optional type validation
    if (validator && !validator(requestParams)) {
      throw new Error(`Invalid parameters for ${composeType} operation`);
    }

    // Get active address for the request
    const walletService = getWalletService();
    const activeAddress = await walletService.getActiveAddress();
    if (!activeAddress) {
      throw new Error('No active address');
    }

    // Store the compose request for the popup to retrieve
    const composeRequestId = `compose-${composeType}-${Date.now()}`;
    await composeRequestStorage.store({
      id: composeRequestId,
      type: composeType as any, // Type assertion since we know it's valid
      origin,
      params: {
        ...requestParams,
        sourceAddress: activeAddress.address // Ensure we have source address
      },
      timestamp: Date.now()
    });

    // Open popup first
    try {
      await chrome.action.openPopup();

      // Send navigation message after a short delay to ensure popup is ready
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'NAVIGATE_TO_COMPOSE',
          composeType,
          composeRequestId,
          routePath
        }).catch(() => {
          // Popup might not be ready yet
        });
      }, 100);
    } catch (e) {
      // Fallback: create a new window with the compose form
      const extensionUrl = chrome.runtime.getURL(`popup.html#${routePath}?composeRequestId=${composeRequestId}`);
      const window = await chrome.windows.create({
        url: extensionUrl,
        type: 'popup',
        width: 400,
        height: 600,
        focused: true,
        left: Math.round((screen.width - 400) / 2),
        top: Math.round((screen.height - 600) / 2),
      });
    }

    // Track as critical operation to prevent extension updates during compose
    const updateService = getUpdateService();
    updateService.registerCriticalOperation(`compose-${composeRequestId}`);

    // Return a promise that will resolve when the user completes the compose flow
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        updateService.unregisterCriticalOperation(`compose-${composeRequestId}`);
        eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
        eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
        reject(new Error('Compose request timeout'));
      }, 10 * 60 * 1000); // 10 minute timeout

      const handleComplete = (result: any) => {
        clearTimeout(timeout);
        updateService.unregisterCriticalOperation(`compose-${composeRequestId}`);
        eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
        resolve(result);
      };

      const handleCancel = () => {
        clearTimeout(timeout);
        updateService.unregisterCriticalOperation(`compose-${composeRequestId}`);
        eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
        reject(new Error('User cancelled compose request'));
      };

      // Listen for completion events
      eventEmitterService.on(`compose-complete-${composeRequestId}`, handleComplete);
      eventEmitterService.on(`compose-cancel-${composeRequestId}`, handleCancel);
    });
  }

  // Type validators for common compose operations
  const isSendOptions = (params: any): params is Partial<SendOptions> => {
    return typeof params === 'object' &&
           typeof params.destination === 'string' &&
           typeof params.asset === 'string' &&
           (typeof params.quantity === 'number' || typeof params.quantity === 'string');
  };

  const isOrderOptions = (params: any): params is Partial<OrderOptions> => {
    return typeof params === 'object' &&
           typeof params.give_asset === 'string' &&
           typeof params.get_asset === 'string' &&
           (typeof params.give_quantity === 'number' || typeof params.give_quantity === 'string') &&
           (typeof params.get_quantity === 'number' || typeof params.get_quantity === 'string');
  };

  const isDispenserOptions = (params: any): params is Partial<DispenserOptions> => {
    return typeof params === 'object' &&
           typeof params.asset === 'string' &&
           (typeof params.give_quantity === 'number' || typeof params.give_quantity === 'string') &&
           (typeof params.escrow_quantity === 'number' || typeof params.escrow_quantity === 'string');
  };

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
        await analytics.track('request_rejected', { value: '1' });
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
      
      switch (method) {
        // ==================== Connection Methods ====================
        
        case 'xcp_requestAccounts': {
          // Check if any wallets exist first
          const wallets = await walletService.getWallets();
          if (!wallets || wallets.length === 0) {
            // Open popup for wallet setup
            try {
              await chrome.action.openPopup();
            } catch (e) {
              // Fallback: create a new window with the extension popup
              const extensionUrl = chrome.runtime.getURL('popup.html');
              await chrome.windows.create({
                url: extensionUrl,
                type: 'popup',
                width: 400,
                height: 600,
                focused: true
              });
            }
            throw new Error('WALLET_NOT_SETUP: Please complete wallet setup first in the popup window.');
          }

          // Check if already connected - if so, just return accounts
          if (await connectionService.hasPermission(origin)) {
            const accounts = await getAccounts(origin);

            // If wallet is locked, getAccounts returns empty array
            // We should inform the user to unlock the wallet
            if (accounts.length === 0) {
              const isUnlocked = await walletService.isAnyWalletUnlocked();
              if (!isUnlocked) {
                throw new Error('WALLET_LOCKED: Please unlock your wallet first');
              }
              // If unlocked but no accounts, there might be no active address set
              throw new Error('No active address found. Please select an address in the wallet.');
            }

            await analytics.track('accounts_requested', { value: '1' });
            return accounts;
          }

          // Check if wallet is locked
          const isUnlocked = await walletService.isAnyWalletUnlocked();
          if (!isUnlocked) {
            // Open popup for unlock and store the pending request
            const approvalService = getApprovalService();
            const requestId = `${origin}-unlock-${Date.now()}`;

            // Store the pending connection request
            eventEmitterService.emit('pending-unlock-connection', {
              requestId,
              origin,
              method: 'xcp_requestAccounts'
            });

            // Open the regular popup - it will automatically show unlock screen
            // and then navigate to approvals after unlock
            try {
              await chrome.action.openPopup();
            } catch (e) {
              // Fallback: create a new window with the extension popup
              const extensionUrl = chrome.runtime.getURL('popup.html');
              await chrome.windows.create({
                url: extensionUrl,
                type: 'popup',
                width: 400,
                height: 600,
                focused: true
              });
            }

            // Wait for unlock and then continue with connection
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                eventEmitterService.off('wallet-unlocked', handleUnlock);
                reject(new Error('Unlock timeout - please try again'));
              }, 5 * 60 * 1000); // 5 minute timeout

              const handleUnlock = async () => {
                clearTimeout(timeout);
                eventEmitterService.off('wallet-unlocked', handleUnlock);

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
                    const accounts = await getAccounts(origin);
                    resolve(accounts);
                    return;
                  }

                  // Use approval service to request connection
                  const approvalRequestId = `${origin}-connect-afterunlock-${Date.now()}`;
                  const approvalService = getApprovalService();

                  // Request approval (this will handle the UI)
                  approvalService.requestApproval({
                    id: approvalRequestId,
                    origin,
                    method: 'xcp_requestAccounts',
                    params: [],
                    type: 'connection',
                    metadata: {
                      domain: new URL(origin).hostname,
                      title: 'XCP Connect',
                      description: 'This site wants to connect to your wallet',
                    },
                  }).then(async (approved) => {
                    if (approved) {
                      // Save the connection
                      const settings = await getKeychainSettings();
                      if (!settings.connectedWebsites.includes(origin)) {
                        await updateKeychainSettings({
                          connectedWebsites: [...settings.connectedWebsites, origin],
                        });
                      }

                      // Return the accounts
                      const accounts = [activeAddress.address];
                      await analytics.track('connection_established');
                      resolve(accounts);
                    } else {
                      reject(new Error('User denied the request'));
                    }
                  }).catch(reject);
                } catch (error) {
                  reject(error);
                }
              };

              eventEmitterService.on('wallet-unlocked', handleUnlock);
            });
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
          
          // Use approval service to request connection
          const requestId = `${origin}-connect-${Date.now()}`;
          const approvalService = getApprovalService();

          // Request approval (this will open the popup and handle the UI)
          const approved = await approvalService.requestApproval({
            id: requestId,
            origin,
            method: 'xcp_requestAccounts',
            params: [],
            type: 'connection',
            metadata: {
              domain: new URL(origin).hostname,
              title: 'XCP Connect',
              description: 'This site wants to connect to your wallet',
            },
          });

          if (approved) {
            // Save the connection
            const settings = await getKeychainSettings();
            if (!settings.connectedWebsites.includes(origin)) {
              await updateKeychainSettings({
                connectedWebsites: [...settings.connectedWebsites, origin],
              });
            }

            // Return the accounts
            const accounts = [activeAddress.address];
            await analytics.track('connection_established');
            return accounts;
          } else {
            throw new Error('User denied the request');
          }
        }
        
        case 'xcp_accounts': {
          return getAccounts(origin);
        }

        case 'xcp_isConnected': {
          // Check if origin has permission to access wallet
          console.debug('xcp_isConnected checking origin:', origin);
          const hasPermission = await connectionService.hasPermission(origin);
          console.debug('xcp_isConnected result:', hasPermission);
          return hasPermission;
        }

        case 'xcp_connect': {
          // Simple connection request that just checks/establishes permission
          // Unlike xcp_requestAccounts, this doesn't return accounts

          console.debug('xcp_connect called with origin:', origin);

          // Check if already connected
          if (await connectionService.hasPermission(origin)) {
            console.debug('xcp_connect: already connected');
            return true;
          }

          // Check wallet state
          const wallets = await walletService.getWallets();
          if (!wallets || wallets.length === 0) {
            // Open popup for wallet setup
            try {
              await chrome.action.openPopup();
            } catch (e) {
              // Fallback: create a new window with the extension popup
              const extensionUrl = chrome.runtime.getURL('popup.html');
              await chrome.windows.create({
                url: extensionUrl,
                type: 'popup',
                width: 400,
                height: 600,
                focused: true
              });
            }
            throw new Error('WALLET_NOT_SETUP: Please complete wallet setup first in the popup window.');
          }

          const isUnlocked = await walletService.isAnyWalletUnlocked();
          if (!isUnlocked) {
            // For locked wallet, we should add the request to the approval queue first,
            // then open the popup which will unlock and then show the approval
            const activeWallet = wallets[0]; // Use first wallet as a placeholder
            const requestId = `${origin}-connect-${Date.now()}`;

            // Add to approval queue so it will be shown after unlock
            const approvalService = getApprovalService();
            // Add request to queue (but don't wait for it yet)
            approvalQueue.add({
              id: requestId,
              origin,
              method: 'xcp_connect',
              params: [],
              type: 'connection',
              metadata: {
                domain: new URL(origin).hostname,
                title: 'XCP Connect',
                description: 'This site wants to connect to your wallet',
              },
            });

            // Open the popup which will show unlock and then approval
            try {
              await chrome.action.openPopup();
            } catch (e) {
              // Fallback: create a new window with the extension popup
              const extensionUrl = chrome.runtime.getURL('popup.html');
              await chrome.windows.create({
                url: extensionUrl,
                type: 'popup',
                width: 400,
                height: 600,
                focused: true
              });
            }

            // Wait for the approval resolution
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                eventEmitterService.off(`resolve-${requestId}`);
                approvalService.removeApprovalRequest(requestId);
                reject(new Error('Connection request timeout'));
              }, 5 * 60 * 1000); // 5 minutes timeout

              eventEmitterService.once(`resolve-${requestId}`, async (data: boolean | { approved: boolean }) => {
                clearTimeout(timeout);
                const approved = typeof data === 'boolean' ? data : data.approved;

                if (approved) {
                  // After approval, save the connection
                  const activeAddress = await walletService.getActiveAddress();
                  const activeWallet = await walletService.getActiveWallet();

                  if (activeAddress && activeWallet) {
                    const settings = await getKeychainSettings();
                    if (!settings.connectedWebsites.includes(origin)) {
                      await updateKeychainSettings({
                        connectedWebsites: [...settings.connectedWebsites, origin],
                      });
                    }
                  }

                  resolve(true);
                } else {
                  reject(new Error('User denied the request'));
                }
              });
            });
          }

          const activeAddress = await walletService.getActiveAddress();
          const activeWallet = await walletService.getActiveWallet();

          if (!activeAddress || !activeWallet) {
            throw new Error('No active wallet or address selected.');
          }

          // Use approval service to request connection
          const requestId = `${origin}-xcp-connect-${Date.now()}`;
          const approvalService = getApprovalService();

          // Request approval (this will open the popup and handle the UI)
          const approved = await approvalService.requestApproval({
            id: requestId,
            origin,
            method: 'xcp_connect',
            params: [],
            type: 'connection',
            metadata: {
              domain: new URL(origin).hostname,
              title: 'XCP Connect',
              description: 'This site wants to connect to your wallet',
            },
          });

          if (approved) {
            // Save the connection
            const settings = await getKeychainSettings();
            if (!settings.connectedWebsites.includes(origin)) {
              await updateKeychainSettings({
                connectedWebsites: [...settings.connectedWebsites, origin],
              });
            }

            // For xcp_connect, we return true instead of accounts
            await analytics.track('connection_established');
            return true;
          } else {
            throw new Error('User denied the request');
          }
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
          const signMessageRequestId = `sign-message-${Date.now()}`;
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
          try {
            await chrome.action.openPopup();
          } catch (e) {
            // Fallback: create a new window with the sign message form
            const extensionUrl = chrome.runtime.getURL(`popup.html#/actions/sign-message?signMessageRequestId=${signMessageRequestId}`);
            await chrome.windows.create({
              url: extensionUrl,
              type: 'popup',
              width: 400,
              height: 600,
              focused: true
            });
          }

          // Track as critical operation to prevent extension updates during sign message
          const updateService = getUpdateService();
          updateService.registerCriticalOperation(`sign-message-${signMessageRequestId}`);

          // Return a promise that will resolve when the user completes the sign message flow
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              updateService.unregisterCriticalOperation(`sign-message-${signMessageRequestId}`);
              eventEmitterService.off(`sign-message-complete-${signMessageRequestId}`, handleComplete);
              eventEmitterService.off(`sign-message-cancel-${signMessageRequestId}`, handleCancel);
              reject(new Error('Sign message request timeout'));
            }, 10 * 60 * 1000); // 10 minute timeout

            const handleComplete = (result: any) => {
              clearTimeout(timeout);
              updateService.unregisterCriticalOperation(`sign-message-${signMessageRequestId}`);
              eventEmitterService.off(`sign-message-cancel-${signMessageRequestId}`, handleCancel);
              analytics.track('message_signed');
              resolve(result.signature); // Return just the signature for compatibility
            };

            const handleCancel = () => {
              clearTimeout(timeout);
              updateService.unregisterCriticalOperation(`sign-message-${signMessageRequestId}`);
              eventEmitterService.off(`sign-message-complete-${signMessageRequestId}`, handleComplete);
              reject(new Error('User cancelled sign message request'));
            };

            // Listen for completion events
            eventEmitterService.on(`sign-message-complete-${signMessageRequestId}`, handleComplete);
            eventEmitterService.on(`sign-message-cancel-${signMessageRequestId}`, handleCancel);
          });
        }
        
        case 'xcp_signTransaction': {
          // xcp_signTransaction is deprecated for security reasons.
          // Use compose methods (xcp_composeSend, xcp_composeOrder, etc.) instead.
          // These provide transparent UI flows where users can review transactions before signing.
          throw new Error('xcp_signTransaction is deprecated. Use compose methods (xcp_composeSend, xcp_composeOrder, etc.) for secure, transparent transaction creation.');
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

          // Get active address for the request
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw new Error('No active address');
          }

          // Store the compose request for the popup to retrieve
          const composeRequestId = `compose-send-${Date.now()}`;
          await composeRequestStorage.store({
            id: composeRequestId,
            type: 'send',
            origin,
            params: {
              ...sendParams,
              sourceAddress: activeAddress.address // Ensure we have source address
            },
            timestamp: Date.now()
          });

          // Register critical operation to prevent updates during compose
          const updateService = getUpdateService();
          updateService.registerCriticalOperation(composeRequestId);

          // Determine the route path
          const asset = sendParams.asset || 'XCP';
          const routePath = `/compose/send/${asset}`;

          // Send message to popup to navigate to compose form
          chrome.runtime.sendMessage({
            type: 'NAVIGATE_TO_COMPOSE',
            composeType: 'send',
            composeRequestId,
            routePath,
            asset
          }).catch(() => {
            // Popup might not be open yet
          });

          // Open popup at the compose send form
          try {
            await chrome.action.openPopup();
          } catch (e) {
            // Fallback: create a new window with the compose form
            const extensionUrl = chrome.runtime.getURL(`popup.html#${routePath}?composeRequestId=${composeRequestId}`);
            await chrome.windows.create({
              url: extensionUrl,
              type: 'popup',
              width: 400,
              height: 600,
              focused: true
            });
          }

          // Return a promise that will resolve when the user completes the compose flow
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              updateService.unregisterCriticalOperation(composeRequestId);
              eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
              eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
              reject(new Error('Compose request timeout'));
            }, 10 * 60 * 1000); // 10 minute timeout

            const handleComplete = (result: any) => {
              clearTimeout(timeout);
              updateService.unregisterCriticalOperation(composeRequestId);
              eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
              resolve(result);
            };

            const handleCancel = () => {
              clearTimeout(timeout);
              updateService.unregisterCriticalOperation(composeRequestId);
              eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
              reject(new Error('User cancelled compose request'));
            };

            eventEmitterService.on(`compose-complete-${composeRequestId}`, handleComplete);
            eventEmitterService.on(`compose-cancel-${composeRequestId}`, handleCancel);
          });
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

          // Get active address for the request
          const activeAddress = await walletService.getActiveAddress();
          if (!activeAddress) {
            throw new Error('No active address');
          }

          // Store the compose request for the popup to retrieve
          const composeRequestId = `compose-order-${Date.now()}`;
          await composeRequestStorage.store({
            id: composeRequestId,
            type: 'order',
            origin,
            params: {
              ...orderParams,
              sourceAddress: activeAddress.address // Ensure we have source address
            },
            timestamp: Date.now()
          });

          // Register critical operation
          const updateService = getUpdateService();
          updateService.registerCriticalOperation(composeRequestId);

          // Open popup at the compose order form
          try {
            await chrome.action.openPopup();
          } catch (e) {
            // Fallback: create a new window with the compose form
            const extensionUrl = chrome.runtime.getURL(`popup.html#/compose/order?composeRequestId=${composeRequestId}`);
            await chrome.windows.create({
              url: extensionUrl,
              type: 'popup',
              width: 400,
              height: 600,
              focused: true
            });
          }

          // Return a promise that will resolve when the user completes the compose flow
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              updateService.unregisterCriticalOperation(composeRequestId);
              eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
              eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
              reject(new Error('Compose request timeout'));
            }, 10 * 60 * 1000); // 10 minute timeout

            const handleComplete = (result: any) => {
              clearTimeout(timeout);
              updateService.unregisterCriticalOperation(composeRequestId);
              eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
              resolve(result);
            };

            const handleCancel = () => {
              clearTimeout(timeout);
              updateService.unregisterCriticalOperation(composeRequestId);
              eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
              reject(new Error('User cancelled compose request'));
            };

            eventEmitterService.on(`compose-complete-${composeRequestId}`, handleComplete);
            eventEmitterService.on(`compose-cancel-${composeRequestId}`, handleCancel);
          });
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

          // Store the compose request for the popup to retrieve
          const composeRequestId = `compose-dispenser-${Date.now()}`;
          await composeRequestStorage.store({
            id: composeRequestId,
            type: 'dispenser',
            origin,
            params: dispenserParams,
            timestamp: Date.now()
          });

          // Send message to popup to navigate to compose form
          chrome.runtime.sendMessage({
            type: 'NAVIGATE_TO_COMPOSE',
            composeType: 'dispenser',
            composeRequestId
          }).catch(() => {
            // Popup might not be open yet
          });

          // Open popup at the compose dispenser form
          try {
            await chrome.action.openPopup();
          } catch (e) {
            // Fallback: create a new window with the compose form
            const extensionUrl = chrome.runtime.getURL(`popup.html#/compose/dispenser?composeRequestId=${composeRequestId}`);
            await chrome.windows.create({
              url: extensionUrl,
              type: 'popup',
              width: 400,
              height: 600,
              focused: true
            });
          }

          // Return a promise that will resolve when the user completes the compose flow
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
              eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
              reject(new Error('Compose request timeout'));
            }, 10 * 60 * 1000); // 10 minute timeout

            const handleComplete = (result: any) => {
              clearTimeout(timeout);
              eventEmitterService.off(`compose-cancel-${composeRequestId}`, handleCancel);
              resolve(result);
            };

            const handleCancel = () => {
              clearTimeout(timeout);
              eventEmitterService.off(`compose-complete-${composeRequestId}`, handleComplete);
              reject(new Error('User cancelled compose request'));
            };

            eventEmitterService.on(`compose-complete-${composeRequestId}`, handleComplete);
            eventEmitterService.on(`compose-cancel-${composeRequestId}`, handleCancel);
          });
        }
        
        case 'xcp_composeDividend': {
          return await handleComposeRequest(origin, params, 'dividend', 'Dividend parameters required', '/compose/dividend');
        }
        
        case 'xcp_composeIssuance': {
          return await handleComposeRequest(origin, params, 'issuance', 'Issuance parameters required', '/compose/issuance');
        }

        case 'xcp_composeDispense': {
          return await handleComposeRequest(origin, params, 'dispense', 'Dispense parameters required', '/compose/dispenser/dispense');
        }

        case 'xcp_composeFairminter': {
          return await handleComposeRequest(origin, params, 'fairminter', 'Fairminter parameters required', '/compose/fairminter');
        }

        case 'xcp_composeFairmint': {
          return await handleComposeRequest(origin, params, 'fairmint', 'Fairmint parameters required', '/compose/fairmint');
        }

        case 'xcp_composeSweep': {
          return await handleComposeRequest(origin, params, 'sweep', 'Sweep parameters required', '/compose/sweep');
        }

        case 'xcp_composeBTCPay': {
          return await handleComposeRequest(origin, params, 'btcpay', 'BTC pay parameters required', '/compose/btcpay');
        }

        case 'xcp_composeCancel': {
          return await handleComposeRequest(origin, params, 'cancel', 'Cancel parameters required', '/compose/cancel');
        }

        case 'xcp_composeDispenserCloseByHash': {
          return await handleComposeRequest(origin, params, 'dispenser-close-by-hash', 'Dispenser close by hash parameters required', '/compose/dispenser/close-by-hash');
        }

        case 'xcp_composeBet': {
          return await handleComposeRequest(origin, params, 'bet', 'Bet parameters required', '/compose/bet');
        }

        case 'xcp_composeBroadcast': {
          return await handleComposeRequest(origin, params, 'broadcast', 'Broadcast parameters required', '/compose/broadcast');
        }

        case 'xcp_composeAttach': {
          return await handleComposeRequest(origin, params, 'attach', 'Attach parameters required', '/compose/utxo/attach');
        }

        case 'xcp_composeDetach': {
          return await handleComposeRequest(origin, params, 'detach', 'Detach parameters required', '/compose/utxo/detach');
        }

        case 'xcp_composeMoveUTXO': {
          return await handleComposeRequest(origin, params, 'move-utxo', 'Move UTXO parameters required', '/compose/utxo/move');
        }

        case 'xcp_composeDestroy': {
          return await handleComposeRequest(origin, params, 'destroy', 'Destroy parameters required', '/compose/destroy');
        }

        case 'xcp_composeIssueSupply': {
          return await handleComposeRequest(origin, params, 'issue-supply', 'Issue supply parameters required', '/compose/issuance/issue-supply');
        }

        case 'xcp_composeLockSupply': {
          return await handleComposeRequest(origin, params, 'lock-supply', 'Lock supply parameters required', '/compose/issuance/lock-supply');
        }

        case 'xcp_composeResetSupply': {
          return await handleComposeRequest(origin, params, 'reset-supply', 'Reset supply parameters required', '/compose/issuance/reset-supply');
        }

        case 'xcp_composeTransfer': {
          return await handleComposeRequest(origin, params, 'transfer', 'Transfer parameters required', '/compose/issuance/transfer-ownership');
        }

        case 'xcp_composeUpdateDescription': {
          return await handleComposeRequest(origin, params, 'update-description', 'Update description parameters required', '/compose/issuance/update-description');
        }

        case 'xcp_composeLockDescription': {
          return await handleComposeRequest(origin, params, 'lock-description', 'Lock description parameters required', '/compose/issuance/lock-description');
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
          const tempTxid = `pending-${Date.now()}`;
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
      // Log error for debugging
      console.error('Provider request failed:', {
        origin: new URL(origin).hostname,
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
    console.log('Destroying ProviderService...');
    // Services are managed by ServiceRegistry and will be destroyed there
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