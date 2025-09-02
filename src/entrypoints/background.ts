import { registerWalletService, getWalletService } from '@/services/walletService';
import { registerProviderService, getProviderService } from '@/services/providerService';
import { registerBlockchainService, getBlockchainService } from '@/services/blockchain';
import { registerConnectionService } from '@/services/connection';
import { registerApprovalService } from '@/services/approval';
import { registerTransactionService } from '@/services/transaction';
import { eventEmitterService } from '@/services/eventEmitterService';
import { ServiceRegistry } from '@/services/core/ServiceRegistry';
import { MessageBus, type ProviderMessage, type ApprovalMessage, type EventMessage } from '@/services/core/MessageBus';
import { checkSessionRecovery, SessionRecoveryState } from '@/utils/auth/sessionManager';
import { shouldBlockConnection, getPhishingWarning } from '@/utils/security/phishingDetection';
import { JSON_RPC_ERROR_CODES, PROVIDER_ERROR_CODES, createJsonRpcError } from '@/utils/constants/errorCodes';

export default defineBackground(() => {
  // Initialize service registry
  const serviceRegistry = ServiceRegistry.getInstance();
  
  // Initialize core services (non-blocking)
  serviceRegistry.register(eventEmitterService)
    .then(() => {
      console.log('Core services initialized');
    })
    .catch((error) => {
      console.error('Failed to initialize core services:', error);
    });
  
  // Register proxy services (existing pattern)
  registerWalletService();
  registerProviderService();
  registerBlockchainService();
  registerConnectionService();
  registerApprovalService();
  registerTransactionService();
  
  // Set up MessageBus handlers for provider requests
  MessageBus.onMessage('provider-request', async (data: ProviderMessage) => {
    console.debug('Provider request received:', {
      origin: data.origin,
      method: data.data?.method,
      hasParams: !!data.data?.params,
      timestamp: data.timestamp
    });

    try {
      const providerService = getProviderService();
      
      // Extract request details
      const { origin, data: requestData } = data;
      const { method, params = [], metadata = {} } = requestData || {};

      if (!method) {
        return {
          success: false,
          error: createJsonRpcError(
            JSON_RPC_ERROR_CODES.INVALID_REQUEST,
            'Method is required'
          )
        };
      }

      // Security check - phishing detection
      const phishingWarning = await getPhishingWarning(origin);
      if (phishingWarning && await shouldBlockConnection(origin)) {
        console.warn('Blocked request from suspicious origin:', origin);
        
        return {
          success: false,
          error: createJsonRpcError(
            PROVIDER_ERROR_CODES.UNAUTHORIZED,
            'Connection blocked: Suspicious domain detected'
          ),
          requiresPhishingReview: true,
          phishingWarning
        };
      }

      // Handle the request through provider service
      const result = await providerService.handleRequest(
        origin,
        method,
        params,
        metadata
      );

      return {
        success: true,
        result,
        method // Include method for response handling
      };
    } catch (error: any) {
      console.error('Provider request failed:', error);
      
      // Determine appropriate error code
      let errorCode: number = JSON_RPC_ERROR_CODES.INTERNAL_ERROR;
      
      if (error.message?.includes('User denied') || error.message?.includes('User rejected')) {
        errorCode = PROVIDER_ERROR_CODES.USER_REJECTED;
      } else if (error.message?.includes('not connected') || error.message?.includes('Unauthorized')) {
        errorCode = PROVIDER_ERROR_CODES.UNAUTHORIZED;
      } else if (error.message?.includes('not supported') || error.message?.includes('not found')) {
        errorCode = JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND;
      } else if (error.message?.includes('Invalid params')) {
        errorCode = JSON_RPC_ERROR_CODES.INVALID_PARAMS;
      }
      
      return {
        success: false,
        error: createJsonRpcError(
          error.code || errorCode,
          error.message || 'Unknown error'
        )
      };
    }
  });

  // Handle approval resolution from popup
  MessageBus.onMessage('resolve-provider-request', async (data: ApprovalMessage) => {
    const { requestId, approved, updatedParams } = data;
    
    try {
      // Use the eventEmitterService pattern
      eventEmitterService.emit(`resolve-${requestId}`, { 
        approved, 
        updatedParams 
      });
      
      // Also emit the old event for backward compatibility
      eventEmitterService.emit('resolve-pending-request', {
        requestId,
        approved,
        updatedParams
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Failed to resolve provider request:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });
  
  // Handle provider event emission (for accountsChanged, disconnect, etc.)
  MessageBus.onMessage('provider-event', async (data: EventMessage) => {
    const { origin, event, data: eventData } = data;
    
    try {
      if (origin) {
        await emitProviderEvent(origin, event, eventData);
      } else {
        await emitProviderEvent(event, eventData);
      }
      return { success: true };
    } catch (error: any) {
      console.error('Failed to emit provider event:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Check session recovery state on startup (non-blocking)
  checkSessionRecovery().then(recoveryState => {
    
    if (recoveryState === SessionRecoveryState.LOCKED) {
      // Session expired or doesn't exist - ensure everything is locked
      const walletService = getWalletService();
      walletService.lockAllWallets().catch(error => {
        console.error('Failed to lock wallets during session recovery:', error);
      });
    } else if (recoveryState === SessionRecoveryState.NEEDS_REAUTH) {
      // Valid session but secrets lost - notify popup to show auth modal
      // The popup will handle this when it checks wallet state
    }
  }).catch(error => {
    console.error('Session recovery check failed:', error);
    // Continue execution even if session recovery fails
  });
  
  // Set up Chrome alarms for session management and keep-alive
  const KEEP_ALIVE_ALARM_NAME = 'keep-alive';
  const SESSION_EXPIRY_ALARM_NAME = 'session-expiry';
  
  // Create keep-alive alarm to prevent service worker termination
  // This replaces the memory-leaking setTimeout approach
  chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
    periodInMinutes: 0.4 // 24 seconds (less than Chrome's 30s timeout)
  });
  
  // Consolidated alarm handler to avoid multiple listeners
  if (chrome?.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      switch (alarm.name) {
        case SESSION_EXPIRY_ALARM_NAME:
          console.log('Session expired via alarm');
          const walletService = getWalletService();
          await walletService.lockAllWallets();
          break;
          
        case KEEP_ALIVE_ALARM_NAME:
          // Perform minimal activity to keep service worker alive
          // This is automatically cleaned up when the service worker terminates
          chrome.storage.local.get('keep-alive-ping', () => {
            // Just accessing storage is enough to keep the worker alive
          });
          break;
      }
    });
  }


  // Emit events to content scripts
  // This will be used for accountsChanged, disconnect, etc.
  // Enhanced to support origin-specific events for address-level connections
  async function emitProviderEvent(originOrEvent: string, eventOrData?: string | any, data?: any) {
    // Handle both signatures:
    // emitProviderEvent(event, data) - broadcast to all
    // emitProviderEvent(origin, event, data) - send to specific origin
    
    let origin: string | undefined;
    let event: string;
    let eventData: any;
    
    if (data !== undefined) {
      // Three parameters: origin-specific event
      origin = originOrEvent;
      event = eventOrData as string;
      eventData = data;
    } else {
      // Two parameters: broadcast event
      event = originOrEvent;
      eventData = eventOrData;
    }
    
    const tabs = await browser.tabs.query({});
    tabs.forEach(tab => {
      // If origin specified, only send to matching tabs
      if (origin && tab.url && !new URL(tab.url).origin.startsWith(origin)) {
        return;
      }
      
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, {
          type: 'PROVIDER_EVENT',
          event,
          data: eventData
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      }
    });
  }

  // Register the emitProviderEvent function with the event emitter service
  // This makes it available to other services without using global variables
  eventEmitterService.on('emit-provider-event', (args: { origin?: string; event: string; data: any }) => {
    if (args.origin) {
      emitProviderEvent(args.origin, args.event, args.data);
    } else {
      emitProviderEvent(args.event, args.data);
    }
  });
  

  // Add cleanup handlers for service worker termination
  if ('onSuspend' in chrome.runtime) {
    chrome.runtime.onSuspend.addListener(() => {
      console.log('Service worker suspending, cleaning up all services...');
      
      // Destroy all services via registry
      serviceRegistry.destroyAll().catch(console.error);
      
      // Also cleanup provider service (until it's migrated to BaseService)
      const providerService = getProviderService();
      if (providerService.destroy) {
        providerService.destroy().catch(console.error);
      }
    });
  }
  
  // Alternative cleanup for when service worker is about to be terminated
  if ('onSuspendCanceled' in chrome.runtime) {
    chrome.runtime.onSuspendCanceled.addListener(() => {
      console.log('Service worker suspension canceled');
    });
  }
  
  // Note: chrome.runtime.onShutdown is not available in all browsers
  // The onSuspend handler above will handle most cleanup scenarios

  console.debug('Background script initialized with ServiceRegistry and cleanup handlers');
});
