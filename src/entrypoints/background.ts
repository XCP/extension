import { registerWalletService, getWalletService } from '@/services/walletService';
import { registerProviderService, getProviderService } from '@/services/providerService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { analyzePhishingRisk, shouldBlockConnection } from '@/utils/security/phishingDetection';
import { requestSigner } from '@/utils/security/requestSigning';
import { checkSessionRecovery, SessionRecoveryState } from '@/utils/auth/sessionManager';

export default defineBackground(() => {
  registerWalletService();
  registerProviderService();
  
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

  // Handle provider requests from content scripts
  browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
    console.debug('Background received message:', { 
      type: message.type, 
      origin: message.origin, 
      hasData: !!message.data,
      messageKeys: Object.keys(message || {}),
      senderId: sender.id,
      senderUrl: sender.url,
      extensionId: browser.runtime.id
    });
    
    if (message.type === 'PROVIDER_REQUEST' && message.origin && message.data && message.xcpWalletVersion === '2.0') {
      // Handle async response
      (async () => {
        try {
          // Security: Reject requests from iframes
          if (sender.frameId && sender.frameId !== 0) {
            console.warn('Provider request rejected: iframe requests not allowed', { 
              origin: message.origin, 
              frameId: sender.frameId 
            });
            sendResponse({
              success: false,
              error: {
                message: 'Requests from iframes not allowed for security reasons',
                code: 4100 // Unauthorized
              }
            });
            return;
          }
          
          // Security: Check for phishing domains for connection requests
          if (message.data.method === 'xcp_requestAccounts') {
            const analysis = analyzePhishingRisk(message.origin);
            if (analysis.isSuspicious) {
              console.warn('Suspicious domain detected:', message.origin, analysis);
              
              // For blocked risk, show warning page first
              if (analysis.riskLevel === 'blocked') {
                // Open phishing warning page instead of normal approval
                const window = await browser.windows.create({
                  url: browser.runtime.getURL(`/popup.html#/provider/phishing-warning?origin=${encodeURIComponent(message.origin)}&returnTo=${encodeURIComponent('/provider/approval-queue')}`),
                  type: 'popup',
                  width: 350,
                  height: 600,
                  focused: true
                });
                
                sendResponse({
                  success: false,
                  error: {
                    message: 'Phishing protection activated - user must review warning',
                    code: 4001 // User rejected
                  },
                  requiresPhishingReview: true,
                  windowId: window?.id
                });
                return;
              }
            }
            
            // Block critical risk domains entirely
            if (await shouldBlockConnection(message.origin)) {
              sendResponse({
                success: false,
                error: {
                  message: 'Connection blocked: Suspicious domain detected',
                  code: 4100 // Unauthorized
                }
              });
              return;
            }
          }
          
          const providerService = getProviderService();
          const { method, params } = message.data;
          
          // Sign the request for authenticity verification
          try {
            const signedRequest = await requestSigner.signRequest(message.origin, method, params);
            
            // Verify our own signature (sanity check)
            if (!requestSigner.verifyRequest(signedRequest)) {
              console.error('Request signing verification failed');
            }
            
            // Add signature info to the request metadata
            const requestMetadata = {
              signature: signedRequest.signature,
              publicKey: signedRequest.publicKey,
              nonce: signedRequest.nonce,
              timestamp: signedRequest.timestamp
            };
            
            const result = await providerService.handleRequest(message.origin, method, params, requestMetadata);
            console.debug('Provider request succeeded:', { method, result });
            sendResponse({ 
              success: true, 
              result,
              method // Include method for response handling
            });
          } catch (error) {
            console.error('Provider request failed:', { method, error });
            sendResponse({ 
              success: false, 
              error: { 
                message: (error as any).message || 'Unknown error',
                code: (error as any).code || -32603 // Internal error
              } 
            });
          }
        } catch (outerError) {
          console.error('Unexpected error in message handler:', outerError);
          sendResponse({
            success: false,
            error: {
              message: 'Internal extension error',
              code: -32603
            }
          });
        }
      })();
      return true; // Will respond asynchronously
    }
    
    // Handle approval resolution from popup
    if (message.type === 'RESOLVE_PROVIDER_REQUEST' && message.requestId) {
      // Use the event emitter service to notify the provider service
      eventEmitterService.emit('resolve-pending-request', {
        requestId: message.requestId,
        approved: message.approved,
        updatedParams: message.updatedParams
      });
      sendResponse({ success: true });
      return true;
    }
    
    // Handle provider event emission from popup
    if (message.type === 'EMIT_PROVIDER_EVENT' && message.event) {
      // Forward the event to the appropriate origin
      if (message.origin) {
        emitProviderEvent(message.origin, message.event, message.data);
      } else {
        emitProviderEvent(message.event, message.data);
      }
      sendResponse({ success: true });
      return true;
    }
    
    // Return false to indicate we're not handling this message
    return false;
  });

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
  

  console.debug('Background script initialized with provider support');
});
