/**
 * Native proxy service replacement for @webext-core/proxy-service
 *
 * This utility provides a simple way to expose services from the background
 * script to other contexts (popup, content scripts) using Chrome's runtime messaging.
 *
 * WHY THIS EXISTS:
 * - Security: Reduces dependencies (replaced @webext-core/proxy-service)
 * - Control: Full control over service communication patterns
 * - Type Safety: Maintains TypeScript types across contexts
 *
 * HOW IT WORKS:
 * 1. Services are defined and registered in the background script
 * 2. Other contexts get a proxy object that looks like the real service
 * 3. Method calls on the proxy are converted to Chrome runtime messages
 * 4. Background script receives messages, calls real service, returns results
 *
 * USED BY:
 * - WalletService: Core wallet operations
 * - ProviderService: Web3 provider methods
 * - ConnectionService: DApp connection management
 * - ApprovalService: User approval flows
 */

type ServiceFactory<T> = () => T;

interface ProxyMessage {
  serviceName: string;
  methodName: string;
  args: any[];
}

interface ProxyResponse {
  success: boolean;
  result?: any;
  error?: string;
}

// Track registered services to prevent duplicate listeners after service worker restarts
const registeredServices = new Set<string>();

/**
 * Creates a proxy service that can be registered in the background script
 * and accessed from other contexts.
 *
 * @param serviceName - Unique name for the service
 * @param factory - Factory function that creates the service instance
 * @returns Tuple of [registerFunction, getServiceFunction]
 */
export function defineProxyService<T extends Record<string, any>>(
  serviceName: string,
  factory: ServiceFactory<T>
): [() => T, () => T] {
  let serviceInstance: T | undefined;

  // Register function for background script
  const register = (): T => {
    if (!isBackgroundScript()) {
      throw new Error(
        `[ProxyService] ${serviceName} can only be registered in the background script`
      );
    }

    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error(`[ProxyService] Chrome runtime not available for ${serviceName}`);
    }

    // Prevent duplicate registration (can happen on service worker restart)
    if (registeredServices.has(serviceName)) {
      console.log(`[ProxyService] ${serviceName} already registered, skipping listener setup`);
      // Still create new instance but don't add another listener
      serviceInstance = factory();
      return serviceInstance;
    }

    // Mark as registered before adding listener
    registeredServices.add(serviceName);

    // Create service instance
    serviceInstance = factory();

    // Listen for messages from other contexts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.serviceName !== serviceName) {
        return false;
      }

      const { methodName, args } = message as ProxyMessage;

      // Check if method exists on service
      if (!serviceInstance || !(methodName in serviceInstance) || typeof serviceInstance[methodName] !== 'function') {
        sendResponse({
          success: false,
          error: `Method ${methodName} not found on ${serviceName}`
        } as ProxyResponse);
        return true;
      }

      // Execute the method with timeout to prevent indefinite hangs
      const PROXY_TIMEOUT = 30000; // 30 second timeout for proxy calls
      let responded = false;

      const executeMethod = async () => {
        try {
          const result = await serviceInstance![methodName](...args);
          if (!responded) {
            responded = true;
            sendResponse({
              success: true,
              result
            } as ProxyResponse);
          }
        } catch (error) {
          if (!responded) {
            responded = true;
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            } as ProxyResponse);
          }
        }
      };

      // Set up timeout to prevent indefinite waits
      setTimeout(() => {
        if (!responded) {
          responded = true;
          console.error(`[ProxyService] ${serviceName}.${methodName} timed out after ${PROXY_TIMEOUT}ms`);
          sendResponse({
            success: false,
            error: `Request to ${serviceName}.${methodName} timed out after ${PROXY_TIMEOUT / 1000}s`
          } as ProxyResponse);
        }
      }, PROXY_TIMEOUT);

      executeMethod();
      return true; // Keep message channel open for async response
    });

    console.log(`[ProxyService] Registered ${serviceName}`);
    return serviceInstance;
  };

  // Get service function for popup/content scripts
  const getService = (): T => {
    // If we're in the background script, return the actual service instance
    if (isBackgroundScript()) {
      if (!serviceInstance) {
        throw new Error(
          `Failed to get an instance of ${serviceName}: in background, but registerService has not been called. Did you forget to call registerService?`
        );
      }
      return serviceInstance;
    }
    // Create a proxy object that forwards all method calls to the background script
    return new Proxy({} as T, {
      get: (target, prop: string) => {
        // Return a function that sends a message to the background script
        return async (...args: any[]) => {
          if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            throw new Error(`Chrome runtime not available for ${serviceName}`);
          }

          return new Promise((resolve, reject) => {
            const message: ProxyMessage = {
              serviceName,
              methodName: prop,
              args
            };

            chrome.runtime.sendMessage(message, (response: ProxyResponse) => {
              // ALWAYS check lastError first to prevent console warnings
              const error = chrome.runtime.lastError;

              if (error) {
                // For "Receiving end does not exist" errors, retry with exponential backoff
                if (error.message?.includes('Could not establish connection') ||
                    error.message?.includes('Receiving end does not exist')) {
                  // Retry logic for startup race conditions
                  let retries = 3;
                  let delay = 100;

                  const retry = () => {
                    if (retries > 0) {
                      retries--;
                      setTimeout(() => {
                        chrome.runtime.sendMessage(message, (retryResponse: ProxyResponse) => {
                          const retryError = chrome.runtime.lastError;
                          if (retryError) {
                            if (retries > 0) {
                              delay *= 2; // Exponential backoff
                              retry();
                            } else {
                              reject(new Error(retryError.message || 'Unknown runtime error'));
                            }
                          } else if (!retryResponse) {
                            reject(new Error(`No response from ${serviceName}.${prop}`));
                          } else if (retryResponse.success) {
                            resolve(retryResponse.result);
                          } else {
                            reject(new Error(retryResponse.error || `${serviceName}.${prop} failed`));
                          }
                        });
                      }, delay);
                    } else {
                      reject(new Error(error.message || 'Unknown runtime error'));
                    }
                  };

                  retry();
                  return;
                }

                // Other errors - don't retry
                reject(new Error(error.message || 'Unknown runtime error'));
                return;
              }

              if (!response) {
                reject(new Error(`No response from ${serviceName}.${prop}`));
                return;
              }

              if (response.success) {
                resolve(response.result);
              } else {
                reject(new Error(response.error || `${serviceName}.${prop} failed`));
              }
            });
          });
        };
      }
    });
  };

  return [register, getService];
}

/**
 * Helper to check if we're in the background script context
 * (Manifest V3 service worker only)
 */
export function isBackgroundScript(): boolean {
  // Check if we can access the extension API
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    return false;
  }

  // For Manifest V3: Check if we're in a service worker context
  // Service workers have `self` but no `window`
  return typeof self !== 'undefined' && typeof window === 'undefined';
}