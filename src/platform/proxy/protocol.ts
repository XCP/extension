/**
 * What both ends of the service RPC agree on: the port name, the message shapes, and which
 * methods a policy exposes. The background side lives in server.ts, the page side in client.ts;
 * neither imports the other, so each bundle carries only its own half.
 */

import type { HardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import type { ProviderReviewCode } from '@/core/providerReviewErrors';

export type MethodName<T> = Extract<{
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T], string>;

export interface ProxyServicePolicy<T> {
  /** Only these methods are remotely callable. Commands are never automatically replayed. */
  methods: Partial<Record<MethodName<T>, 'read' | 'command'>>;
  /** The page bridge may only call handleRequest; its origin comes from Chrome's sender. */
  contentScript?: 'provider';
}

/** `ack` opts in to a receipt; a caller that never asked (older clients, raw test ports) gets exactly one reply. */
export interface PortRequest { id: number; methodName: string; args: unknown[]; ack?: true }
export type PortResponse =
  | { id: number; success: true; result: unknown; resultEncoding?: 'xcp-json-v1' }
  | { id: number; success: false; error: { message: string; code?: number; reviewCode?: ProviderReviewCode; hardware?: HardwareErrorMetadata } };

/** The background's "request received", sent before it waits on anything. Not a result. */
export interface PortAck { id: number; ack: true }
/**
 * Liveness probe while calls wait on a port. It has no `id`, so no caller can mistake it (or its
 * echo) for a request or an answer, and the background answers it without touching any service.
 */
export interface PortHeartbeat { heartbeat: number }

/** Both ends open and accept ports by this name, so a service's name is its address. */
export const proxyPortName = (serviceName: string): string => `proxy:${serviceName}`;

/** The policy's methods, keyed loosely so either end can look up a method name from the wire. */
export function policyMethods<T>(policy: ProxyServicePolicy<T>): Readonly<Record<string, 'read' | 'command' | undefined>> {
  return policy.methods as Readonly<Record<string, 'read' | 'command' | undefined>>;
}

/**
 * The MV3 background is a service worker: extension APIs and no window. Every document (popup,
 * side panel, content script) has a window. The wallet builds for Chrome MV3 only, so there is no
 * background document to recognise.
 */
export function isBackgroundScript(): boolean {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
  return typeof window === 'undefined' && typeof self !== 'undefined';
}
