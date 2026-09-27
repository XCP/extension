/**
 * The background half of the service RPC: registers a service and answers its port, scoped by
 * sender (extension pages may call the policy's methods, the provider bridge only handleRequest,
 * with the origin Chrome reports). Pages reach it through client.ts; what both ends agree on is in
 * protocol.ts.
 */

import { parseHardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { HardwareWalletError } from '@/core/hardware/types';
import { isRecord } from '@/core/isRecord';
import { providerReviewCode } from '@/core/providerReviewErrors';
import { ProviderError } from '@/core/rpcErrors';
import { recordProviderTab } from '@/platform/browser';
import {
  isBackgroundScript, type PortAck, type PortHeartbeat, type PortRequest, type PortResponse,
  type ProxyServicePolicy, policyMethods, proxyPortName,
} from '@/platform/proxy/protocol';
import { encodeProxyResult } from '@/platform/proxy/serialization';
import { whenServicesReady } from '@/platform/serviceReadiness';

const registeredServices = new Set<string>();
const MAX_REQUEST_BYTES = 1024 * 1024 + 4096;

function parseRequest(value: unknown): PortRequest | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1
    || typeof value.methodName !== 'string' || value.methodName.length > 100
    || !Array.isArray(value.args) || value.args.length > 16) return null;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_REQUEST_BYTES) return null;
  } catch { return null; }
  return { id: value.id as number, methodName: value.methodName, args: value.args, ...(value.ack === true ? { ack: true } : {}) };
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

/**
 * The background's side of a service: `register` builds it and starts answering its port, and
 * `getService` hands the registered instance to other background code. Pages never import this;
 * they reach the service through defineProxyClient with the same name and policy.
 */
export function defineProxyServer<T extends object>(
  serviceName: string,
  factory: () => T,
  policy: ProxyServicePolicy<T> = { methods: {} },
): [register: () => T, getService: () => T] {
  let serviceInstance: T | undefined;
  const portName = proxyPortName(serviceName);
  const methods = policyMethods(policy);
  const canCall = (method: string) => Object.hasOwn(methods, method);

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
      // The one place the worker learns, from Chrome rather than the page, which tab shows which
      // origin; provider events are addressed with it (see platform/browser.ts).
      const tabId = incoming.sender?.tab?.id;
      if (origin && tabId !== undefined && tabId >= 0) {
        void recordProviderTab(tabId, origin).catch(() => { /* events fall back to not reaching this tab */ });
      }

      let disconnected = false;
      const reply = (response: PortResponse | PortAck | PortHeartbeat) => {
        if (!disconnected) {
          try { incoming.postMessage(response); } catch { /* the requesting document closed */ }
        }
      };
      const dispatch = async (value: unknown): Promise<void> => {
        if (isRecord(value) && !Object.hasOwn(value, 'id') && Number.isSafeInteger(value.heartbeat)) {
          reply({ heartbeat: value.heartbeat as number });
          return;
        }
        const request = parseRequest(value);
        if (!request) {
          if (isRecord(value) && Number.isSafeInteger(value.id)) {
            reply({ id: value.id as number, success: false, error: { message: 'Invalid RPC request', code: -32600 } });
          }
          return;
        }
        const { id, methodName } = request;
        // Receipt, not an answer: lets the caller tell a slow call from a port nobody reads. Only on
        // request, so a caller that treats the first message for its id as the answer is unaffected.
        if (request.ack) reply({ id, ack: true });
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
            reviewCode: providerReviewCode(error),
            // Device diagnostics are for extension UI, not a new public provider contract.
            hardware: trustedUI && error instanceof HardwareWalletError ? parseHardwareErrorMetadata(error) : undefined,
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

  const getService = (): T => {
    if (!serviceInstance) throw new Error(`Failed to get an instance of ${serviceName}: registerService has not been called`);
    return serviceInstance;
  };
  return [register, getService];
}
