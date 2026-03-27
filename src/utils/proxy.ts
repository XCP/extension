/**
 * Port-based proxy service for cross-context communication.
 *
 * Exposes background services to content scripts and popup via persistent
 * chrome.runtime.connect ports. Ports give instant disconnect detection and
 * natural reconnection — no timeout hacks or retry loops needed.
 *
 * API is unchanged: defineProxyService(name, factory) => [register, getService]
 */

type ServiceFactory<T> = () => T;

interface PortRequest {
  id: number;
  methodName: string;
  args: any[];
}

interface PortResponse {
  id: number;
  success: boolean;
  result?: any;
  error?: string;
}

// Prevent duplicate onConnect listeners after service worker restarts
const registeredServices = new Set<string>();

// Track all client-side ports for disconnectAllPorts()
const activePorts = new Map<string, chrome.runtime.Port>();

const PORT_PREFIX = 'proxy:';

/**
 * Disconnect all cached proxy ports. Call this before BFCache freeze
 * or when the extension context is invalidated.
 */
export function disconnectAllPorts(): void {
  for (const [, port] of activePorts) {
    try { port.disconnect(); } catch {}
  }
  activePorts.clear();
}

export function defineProxyService<T extends Record<string, any>>(
  serviceName: string,
  factory: ServiceFactory<T>
): [() => T, () => T] {
  let serviceInstance: T | undefined;
  const portName = `${PORT_PREFIX}${serviceName}`;

  // ---------------------------------------------------------------------------
  // Background side: listen for port connections, dispatch to service methods
  // ---------------------------------------------------------------------------
  const register = (): T => {
    if (!isBackgroundScript()) {
      throw new Error(
        `[ProxyService] ${serviceName} can only be registered in the background script`
      );
    }

    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error(`[ProxyService] Chrome runtime not available for ${serviceName}`);
    }

    if (registeredServices.has(serviceName)) {
      serviceInstance = factory();
      return serviceInstance;
    }

    registeredServices.add(serviceName);
    serviceInstance = factory();

    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== portName) return;
      if (port.sender?.id !== chrome.runtime.id) {
        port.disconnect();
        return;
      }

      port.onMessage.addListener(async (msg: PortRequest) => {
        const { id, methodName, args } = msg;

        if (!serviceInstance || !(methodName in serviceInstance) || typeof serviceInstance[methodName] !== 'function') {
          try {
            port.postMessage({ id, success: false, error: `Method ${methodName} not found on ${serviceName}` } as PortResponse);
          } catch {}
          return;
        }

        try {
          const result = await serviceInstance[methodName](...args);
          try { port.postMessage({ id, success: true, result } as PortResponse); } catch {}
        } catch (error) {
          try {
            port.postMessage({
              id,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            } as PortResponse);
          } catch {}
        }
      });

      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) { /* consumed */ }
      });
    });

    return serviceInstance;
  };

  // ---------------------------------------------------------------------------
  // Client side: lazy port connection with id-based multiplexing
  // ---------------------------------------------------------------------------
  let port: chrome.runtime.Port | null = null;
  let pendingCalls = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  function ensurePort(): chrome.runtime.Port {
    if (port) return port;

    port = chrome.runtime.connect({ name: portName });
    activePorts.set(serviceName, port);

    port.onMessage.addListener((msg: PortResponse) => {
      const pending = pendingCalls.get(msg.id);
      if (!pending) return;
      pendingCalls.delete(msg.id);
      if (msg.success) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error || `${serviceName} call failed`));
      }
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime?.lastError) { /* consumed */ }
      port = null;
      activePorts.delete(serviceName);
      // Reject all in-flight calls — callers can retry
      for (const [, pending] of pendingCalls) {
        pending.reject(new Error('Port disconnected'));
      }
      pendingCalls.clear();
    });

    return port;
  }

  const getService = (): T => {
    if (isBackgroundScript()) {
      if (!serviceInstance) {
        throw new Error(
          `Failed to get an instance of ${serviceName}: in background, but registerService has not been called. Did you forget to call registerService?`
        );
      }
      return serviceInstance;
    }

    return new Proxy({} as T, {
      get: (_target, prop: string) => {
        return async (...args: any[]) => {
          // Try the call, and if the port is dead, reconnect once and retry
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const p = ensurePort();
              const id = ++nextId;

              return await new Promise<any>((resolve, reject) => {
                pendingCalls.set(id, { resolve, reject });
                p.postMessage({ id, methodName: prop, args } as PortRequest);
              });
            } catch (error) {
              const msg = error instanceof Error ? error.message : '';
              const isDisconnect = msg.includes('Port disconnected') ||
                msg.includes('Attempting to use a disconnected port') ||
                msg.includes('Extension context invalidated');

              if (isDisconnect && attempt === 0) {
                // Port died — null it out and retry once
                port = null;
                activePorts.delete(serviceName);
                await new Promise(r => setTimeout(r, 200));
                continue;
              }
              throw error;
            }
          }
        };
      },
    });
  };

  return [register, getService];
}

export function isBackgroundScript(): boolean {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    return false;
  }
  return typeof self !== 'undefined' && typeof window === 'undefined';
}
