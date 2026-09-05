/** Explicit, sender-scoped RPC over reconnectable extension ports. */
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { decodeProxyResult, encodeProxyResult } from '@/platform/proxySerialization';
import { whenServicesReady } from '@/services/core/serviceReadiness';

type MethodName<T> = Extract<{
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T], string>;

export interface ProxyServicePolicy<T> {
  /** Only these methods are remotely callable. Commands are never automatically replayed. */
  methods: Partial<Record<MethodName<T>, 'read' | 'command'>>;
  /** The page bridge may only call handleRequest; its origin comes from Chrome's sender. */
  contentScript?: 'provider';
}

interface PortRequest { id: number; methodName: string; args: unknown[] }
type PortResponse =
  | { id: number; success: true; result: unknown; resultEncoding?: 'xcp-json-v1' }
  | { id: number; success: false; error: { message: string; code?: number } };

const registeredServices = new Set<string>();
const activePorts = new Map<string, chrome.runtime.Port>();
const PROVIDER_QUERIES = new Set([
  'xcp_accounts', 'xcp_getBalances', 'xcp_getAddresses', 'xcp_chainId', 'xcp_getNetwork',
]);
const MAX_REQUEST_BYTES = 1024 * 1024 + 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRequest(value: unknown): PortRequest | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1
    || typeof value.methodName !== 'string' || value.methodName.length > 100
    || !Array.isArray(value.args) || value.args.length > 16) return null;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_REQUEST_BYTES) return null;
  } catch { return null; }
  return { id: value.id as number, methodName: value.methodName, args: value.args };
}

function parseResponse(value: unknown): PortResponse | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.id)) return null;
  if (value.success === true) {
    try {
      if (value.resultEncoding !== undefined && value.resultEncoding !== 'xcp-json-v1') {
        throw new Error('Unknown RPC result encoding');
      }
      return { id: value.id as number, success: true, result: value.resultEncoding === 'xcp-json-v1'
        ? decodeProxyResult(value.result) : value.result };
    } catch {
      return { id: value.id as number, success: false, error: { message: 'Invalid RPC result encoding' } };
    }
  }
  if (value.success !== false || !isRecord(value.error) || typeof value.error.message !== 'string') return null;
  return {
    id: value.id as number, success: false,
    error: { message: value.error.message, code: typeof value.error.code === 'number' ? value.error.code : undefined },
  };
}

/** Extension tabs are trusted UI too; tab presence alone cannot distinguish them from content. */
export function isExtensionPageSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  if (sender?.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const actual = new URL(sender.url);
    const expected = new URL(chrome.runtime.getURL('/'));
    return actual.protocol === expected.protocol && actual.host === expected.host;
  } catch { return false; }
}

function contentOrigin(sender: chrome.runtime.MessageSender | undefined): string | null {
  if (sender?.id !== chrome.runtime.id || !sender.url || sender.frameId !== 0) return null;
  try {
    const url = new URL(sender.url);
    const allowed = url.protocol === 'https:' || (url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
    if (!allowed || (sender.origin !== undefined && sender.origin !== url.origin)) return null;
    return url.origin;
  } catch { return null; }
}

export function disconnectAllPorts(): void {
  for (const port of activePorts.values()) {
    try { port.disconnect(); } catch { /* already disconnected */ }
  }
  activePorts.clear();
}

export function defineProxyService<T extends object>(
  serviceName: string,
  factory: () => T,
  policy: ProxyServicePolicy<T> = { methods: {} },
): [() => T, () => T] {
  let serviceInstance: T | undefined;
  const portName = `proxy:${serviceName}`;
  const methods = policy.methods as Readonly<Record<string, 'read' | 'command' | undefined>>;
  const canCall = (method: string) => Object.hasOwn(methods, method);
  const canRetry = (method: string, args: unknown[]) => canCall(method) && (
    methods[method] === 'read' || (policy.contentScript === 'provider' && method === 'handleRequest'
      && typeof args[1] === 'string' && PROVIDER_QUERIES.has(args[1]))
  );

  const register = (): T => {
    if (!isBackgroundScript()) throw new Error(`[ProxyService] ${serviceName} can only be registered in the background script`);
    serviceInstance = factory();
    if (registeredServices.has(serviceName)) return serviceInstance;
    registeredServices.add(serviceName);

    chrome.runtime.onConnect.addListener((incoming) => {
      if (incoming.name !== portName) return;
      const trustedUI = isExtensionPageSender(incoming.sender);
      const origin = policy.contentScript === 'provider' ? contentOrigin(incoming.sender) : null;
      if (!trustedUI && !origin) { incoming.disconnect(); return; }

      let disconnected = false;
      const reply = (response: PortResponse) => {
        if (!disconnected) {
          try { incoming.postMessage(response); } catch { /* the requesting document closed */ }
        }
      };
      const dispatch = async (value: unknown): Promise<void> => {
        const request = parseRequest(value);
        if (!request) {
          if (isRecord(value) && Number.isSafeInteger(value.id)) {
            reply({ id: value.id as number, success: false, error: { message: 'Invalid RPC request', code: -32600 } });
          }
          return;
        }
        const { id, methodName } = request;
        if (!canCall(methodName) || (!trustedUI && methodName !== 'handleRequest')) {
          reply({ id, success: false, error: { message: `Method ${methodName} not found on ${serviceName}` } });
          return;
        }
        let args = request.args;
        if (!trustedUI) {
          // Never forward a claimed page origin or arbitrary service arguments.
          if (typeof args[1] !== 'string' || (args[2] !== undefined && !Array.isArray(args[2]))) {
            reply({ id, success: false, error: { message: 'Invalid provider request', code: -32602 } });
            return;
          }
          args = [origin, args[1], args[2] ?? []];
        }
        try {
          await whenServicesReady();
          if (disconnected) return;
          const method = serviceInstance?.[methodName as keyof T];
          if (typeof method !== 'function') throw new Error(`Method ${methodName} not found on ${serviceName}`);
          const result: unknown = await Reflect.apply(method, serviceInstance, args);
          // Encode before replying: serialization failures are service failures, not closed ports.
          reply({ id, success: true, result: encodeProxyResult(result), resultEncoding: 'xcp-json-v1' });
        } catch (error) {
          reply({ id, success: false, error: {
            message: error instanceof Error ? error.message : 'Service call failed',
            code: error instanceof ProviderError ? error.code : undefined,
          } });
        }
      };
      incoming.onMessage.addListener((value: unknown) => {
        void dispatch(value).catch(() => { /* dispatch reports failures; closed ports need no response */ });
      });
      incoming.onDisconnect.addListener(() => {
        disconnected = true;
        if (chrome.runtime.lastError) { /* consumed */ }
      });
    });
    return serviceInstance;
  };

  let port: chrome.runtime.Port | null = null;
  const pendingCalls = new Map<number, { port: chrome.runtime.Port; resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let nextId = 0;

  function ensurePort(): chrome.runtime.Port {
    if (port) return port;
    const connected = chrome.runtime.connect({ name: portName });
    port = connected;
    activePorts.set(serviceName, connected);
    connected.onMessage.addListener((value: unknown) => {
      const response = parseResponse(value);
      if (!response) return;
      const pending = pendingCalls.get(response.id);
      if (!pending || pending.port !== connected) return;
      pendingCalls.delete(response.id);
      if (response.success) pending.resolve(response.result);
      else pending.reject(typeof response.error.code === 'number'
        ? new ProviderError(response.error.code, response.error.message)
        : new Error(response.error.message));
    });
    connected.onDisconnect.addListener(() => {
      if (chrome.runtime?.lastError) { /* consumed */ }
      if (port === connected) port = null;
      if (activePorts.get(serviceName) === connected) activePorts.delete(serviceName);
      for (const [id, pending] of pendingCalls) {
        if (pending.port !== connected) continue;
        pendingCalls.delete(id);
        pending.reject(new ProviderError(PROVIDER_ERROR_CODES.DISCONNECTED, 'Port disconnected'));
      }
    });
    return connected;
  }

  const getService = (): T => {
    if (isBackgroundScript()) {
      if (!serviceInstance) throw new Error(`Failed to get an instance of ${serviceName}: registerService has not been called`);
      return serviceInstance;
    }
    return new Proxy({} as T, {
      get: (_target, prop) => {
        // Service objects are not thenables; inherited/symbol members are not RPC methods.
        if (typeof prop !== 'string' || prop === 'then' || !canCall(prop)) return undefined;
        return async (...args: unknown[]) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            const connected = ensurePort();
            const id = ++nextId;
            try {
              return await new Promise<unknown>((resolve, reject) => {
                pendingCalls.set(id, { port: connected, resolve, reject });
                try { connected.postMessage({ id, methodName: prop, args } satisfies PortRequest); }
                catch (error) { pendingCalls.delete(id); reject(error); }
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : '';
              const isDisconnect = error instanceof ProviderError && error.code === PROVIDER_ERROR_CODES.DISCONNECTED
                || message.includes('Attempting to use a disconnected port') || message.includes('Extension context invalidated');
              if (!isDisconnect || attempt !== 0 || !canRetry(prop, args)) throw error;
              if (port === connected) port = null;
              if (activePorts.get(serviceName) === connected) activePorts.delete(serviceName);
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          throw new ProviderError(PROVIDER_ERROR_CODES.DISCONNECTED, 'Port disconnected');
        };
      },
    });
  };
  return [register, getService];
}

export function isBackgroundScript(): boolean {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
  if (typeof window === 'undefined') return typeof self !== 'undefined';
  // Firefox's MV2 target runs in a background document. A popup also has a window
  // and extension APIs, so only the actual background page's object identity qualifies.
  try {
    return chrome.extension?.getBackgroundPage?.() === window;
  } catch {
    return false;
  }
}
