/** Request-scoped popup lifecycle tracking. Closing one window cannot cancel another request. */
import { cancelPendingSignFlow, getSignFlow, getSignFlowEventPrefix, type SignFlowKind } from '@/platform/provider/signFlow';
import { isExtensionPageSender } from '@/platform/proxy';
import { eventEmitterService } from '@/services/eventEmitterService';

const kinds = new Set<SignFlowKind>(['sign-message', 'sign-transaction', 'sign-psbt', 'sign-psbts']);

class PopupMonitorService {
  // Preserve concurrent-port tracking: a delayed old disconnect cannot abandon
  // the replacement document. Membership is per request, not global.
  private popupPorts = new Map<chrome.runtime.Port, string | null>();
  private activeRequests = new Map<string, { type: SignFlowKind; timestamp: number; ports: Set<chrome.runtime.Port> }>();
  private abandonmentTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private connectListener: ((port: chrome.runtime.Port) => void) | null = null;

  initialize(): void {
    if (this.connectListener) return;
    this.connectListener = port => {
      if (port.name !== 'popup-lifecycle') return;
      if (!isExtensionPageSender(port.sender)) { port.disconnect(); return; }
      this.handlePopupConnect(port);
    };
    chrome.runtime.onConnect.addListener(this.connectListener);
    this.cleanupTimer = setInterval(() => {
      void this.expireRequests().catch(error => console.error('Failed to expire signing requests:', error));
    }, 60_000);
  }

  private handlePopupConnect(port: chrome.runtime.Port): void {
    this.popupPorts.set(port, null);
    port.onDisconnect.addListener(() => {
      const requestId = this.popupPorts.get(port);
      this.popupPorts.delete(port);
      if (!requestId) return;
      this.activeRequests.get(requestId)?.ports.delete(port);
      this.scheduleAbandonment(requestId);
    });
    port.onMessage.addListener((message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const msg = message as { type?: unknown; requestId?: unknown; requestType?: unknown };
      if (msg.type !== 'request-active' || typeof msg.requestId !== 'string'
        || msg.requestId.length > 4096 || !kinds.has(msg.requestType as SignFlowKind)) return;
      // A document owns one approval. It cannot detach another document's request.
      const previous = this.popupPorts.get(port);
      if (previous && previous !== msg.requestId) return;
      this.popupPorts.set(port, msg.requestId);
      const record = this.activeRequests.get(msg.requestId) ?? {
        type: msg.requestType as SignFlowKind, timestamp: Date.now(), ports: new Set<chrome.runtime.Port>(),
      };
      record.ports.add(port);
      this.activeRequests.set(msg.requestId, record);
      const timer = this.abandonmentTimers.get(msg.requestId);
      if (timer) clearTimeout(timer);
      this.abandonmentTimers.delete(msg.requestId);
    });
  }

  private scheduleAbandonment(requestId: string): void {
    if (this.activeRequests.get(requestId)?.ports.size || this.abandonmentTimers.has(requestId)) return;
    this.abandonmentTimers.set(requestId, setTimeout(() => {
      this.abandonmentTimers.delete(requestId);
      if (this.activeRequests.get(requestId)?.ports.size) return;
      void this.cancelRequest(requestId).catch(error => console.error('Failed to cancel abandoned approval:', error));
    }, 5_000));
  }

  private async cancelRequest(requestId: string): Promise<void> {
    const flow = await getSignFlow(requestId);
    // Closing the UI while an approved hardware command runs is not a second
    // decision. Execution still checks expiry and revocation before delivery.
    if (flow?.status === 'pending' && await cancelPendingSignFlow(requestId)) {
      eventEmitterService.emit(`${getSignFlowEventPrefix(flow.kind)}-cancel-${requestId}`, { reason: 'Popup closed' });
    }
    this.markRequestComplete(requestId);
  }

  private async expireRequests(): Promise<void> {
    for (const [requestId, record] of this.activeRequests) {
      const flow = await getSignFlow(requestId);
      // Storage is authoritative: a request registered after a restart retains
      // its original deadline, and a live port never extends that deadline.
      if (!flow) {
        eventEmitterService.emit(`${getSignFlowEventPrefix(record.type)}-cancel-${requestId}`, { reason: 'Request expired' });
        this.markRequestComplete(requestId);
      }
    }
  }

  registerActiveRequest(requestId: string, type: SignFlowKind): void {
    if (!this.activeRequests.has(requestId)) {
      this.activeRequests.set(requestId, { type, timestamp: Date.now(), ports: new Set() });
    }
  }

  markRequestComplete(requestId: string): void {
    const timer = this.abandonmentTimers.get(requestId);
    if (timer) clearTimeout(timer);
    this.abandonmentTimers.delete(requestId);
    this.activeRequests.delete(requestId);
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const timer of this.abandonmentTimers.values()) clearTimeout(timer);
    if (this.connectListener) chrome.runtime.onConnect.removeListener(this.connectListener);
    this.cleanupTimer = null;
    this.connectListener = null;
    this.abandonmentTimers.clear();
    this.activeRequests.clear();
    this.popupPorts.clear();
  }
}

let instance: PopupMonitorService | null = null;
export function getPopupMonitorService(): PopupMonitorService {
  return instance ??= new PopupMonitorService();
}
