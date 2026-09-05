/**
 * ConnectionService - Manages dApp connections and permissions
 * 
 * Extracted from ProviderService to handle:
 * - dApp connection/disconnection lifecycle
 * - Permission management and validation
 * - Connected websites tracking
 * - Connection-related rate limiting
 * - Connection security analysis
 */

import { generateRequestId } from '@/core/id';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { analytics } from '@/platform/fathom';
import { connectionRateLimiter } from '@/platform/provider/rateLimiter';
import { createWriteLock } from '@/platform/storage/mutex';
import { type ApprovalResult, getApprovalService } from '@/services/approvalService';
import { BaseService } from '@/services/core/BaseService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getWalletService } from '@/services/walletService';

export interface ConnectionStatus {
  origin: string;
  isConnected: boolean;
  connectedAddress?: string;
  connectedWallet?: string;
  connectionTime?: number;
  lastActive?: number;
}

interface ConnectionServiceState {
  connectionCache: Map<string, ConnectionStatus>;
  lastSecurityCheck: Map<string, number>;
  pendingPermissionRequests: Set<string>;
}

interface SerializedConnectionState {
  /** Legacy field — no longer restored (see hydrateState) */
  connections?: Array<{ origin: string; status: ConnectionStatus }>;
  securityChecks: Array<{ origin: string; timestamp: number }>;
  /** Legacy field — no longer restored (see hydrateState) */
  pendingRequests?: string[];
}

export class ConnectionService extends BaseService {
  private readonly withConnectionWriteLock = createWriteLock();
  private state: ConnectionServiceState = {
    connectionCache: new Map(),
    lastSecurityCheck: new Map(),
    pendingPermissionRequests: new Set(),
  };

  private static readonly STATE_VERSION = 1;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly SECURITY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

  constructor() {
    super('ConnectionService');
  }

  /**
   * Check if an origin has permission to access wallet
   */
  async hasPermission(origin: string): Promise<boolean> {
    return this.withConnectionWriteLock(() => this.hasPermissionInternal(origin));
  }

  private async hasPermissionInternal(origin: string): Promise<boolean> {
    // Check cache first (fast path)
    const cached = this.state.connectionCache.get(origin);
    const now = Date.now();
    if (cached && now - (cached.lastActive || 0) < ConnectionService.CACHE_TTL) {
      return cached.isConnected;
    }

    // The connection queue serializes this read with grants and revocations, so an old
    // storage result cannot repopulate the cache after a disconnect has completed.
    return this.doPermissionLookup(origin);
  }

  /**
   * Perform the actual permission lookup from storage
   */
  private async doPermissionLookup(origin: string): Promise<boolean> {
    const settings = await getWalletService().getSettings();
    const isConnected = settings.connectedWebsites.includes(origin);

    // Only a positive answer is cached. A negative one is indistinguishable from "the keychain was
    // not loaded when I asked", and caching that for the full TTL locked an approved origin out for
    // five minutes — including after the wallet had finished waking up. Re-reading settings is
    // cheap; being wrong for five minutes is not.
    if (isConnected) {
      this.state.connectionCache.set(origin, {
        origin,
        isConnected: true,
        lastActive: Date.now(),
      });
    } else {
      this.state.connectionCache.delete(origin);
    }

    return isConnected;
  }

  /**
   * Request permission from user for dApp connection
   */
  async requestPermission(
    origin: string,
    address: string,
    walletId: string,
    pairedAddresses = false
  ): Promise<ApprovalResult> {
    // Prevent duplicate requests for the same origin
    const dedupeKey = `${origin}-pending`;
    if (this.state.pendingPermissionRequests.has(dedupeKey)) {
      throw new Error('Connection request already pending for this origin');
    }

    // Check rate limiting
    if (!connectionRateLimiter.isAllowed(origin)) {
      const resetTime = connectionRateLimiter.getResetTime(origin);
      throw new Error(
        `Rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds before trying again.`
      );
    }

    // Security checks before showing permission UI
    await this.performSecurityChecks(origin);

    // Track the connection request
    await analytics.track('connection_request');

    const requestId = generateRequestId(origin);

    // Add both dedupe key and request ID to pending set
    this.state.pendingPermissionRequests.add(dedupeKey);
    this.state.pendingPermissionRequests.add(requestId);

    try {
      // Use ApprovalService for unified approval handling
      const approvalService = getApprovalService();

      let domain = origin;
      try { domain = new URL(origin).hostname; } catch { /* use raw origin */ }
      const result = await approvalService.requestApproval<ApprovalResult>({
        id: requestId,
        origin,
        method: 'xcp_requestAccounts',
        params: [{ capabilities: { pairedAddresses }, address, walletId }],
        type: 'connection',
        metadata: {
          domain,
          title: 'Connection Request',
          description: 'This site wants to connect to your wallet',
        },
      });

      this.state.pendingPermissionRequests.delete(dedupeKey);
      this.state.pendingPermissionRequests.delete(requestId);
      return result;
    } catch (error) {
      this.state.pendingPermissionRequests.delete(dedupeKey);
      this.state.pendingPermissionRequests.delete(requestId);
      throw error;
    }
  }

  async hasPairedAddressPermission(origin: string, walletId: string, address: string): Promise<boolean> {
    const capability = (await getWalletService().getSettings()).providerCapabilities?.[origin];
    return capability?.pairedAddresses === true
      && capability.walletId === walletId
      && capability.address === address;
  }

  /**
   * Record a granted connection.
   *
   * Separate from the request that asked for it, because an approval restored after a restart has
   * no caller left to return to but still grants exactly this.
   */
  private async grantConnection(grant: {
    origin: string;
    address: string;
    walletId: string;
    pairedAddresses: boolean;
  }): Promise<void> {
    return this.withConnectionWriteLock(() => this.grantConnectionInternal(grant));
  }

  private async grantConnectionInternal(grant: {
    origin: string;
    address: string;
    walletId: string;
    pairedAddresses: boolean;
  }): Promise<void> {
    const { origin, address, walletId, pairedAddresses } = grant;

    await analytics.track('connection_established');
    await getWalletService().addConnectedWebsite(origin, pairedAddresses ? { walletId, address } : undefined);

    this.state.connectionCache.set(origin, {
      origin,
      isConnected: true,
      connectedAddress: address,
      connectedWallet: walletId,
      connectionTime: Date.now(),
      lastActive: Date.now(),
    });

    // Nothing else tells the page it was approved: disconnect emits accountsChanged, approval
    // emitted nothing, so a site whose connect promise was lost had no way to learn it was granted.
    eventEmitterService.emit('emit-provider-event', {
      origin,
      event: 'accountsChanged',
      data: [address],
    });
  }

  private async storePairedAddressPermission(
    origin: string,
    walletId: string,
    address: string
  ): Promise<void> {
    await getWalletService().setPairedAddressPermission(origin, { walletId, address });
  }

  private async clearPairedAddressPermission(origin: string): Promise<void> {
    await getWalletService().setPairedAddressPermission(origin, null);
  }

  async requestPairedAddressPermission(
    origin: string,
    address: string,
    walletId: string
  ): Promise<void> {
    if (await this.hasPairedAddressPermission(origin, walletId, address)) return;
    const result = await this.requestPermission(origin, address, walletId, true);
    if (!result.approved || result.updatedParams?.pairedAddresses !== true) {
      throw new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'Paired address access was not granted');
    }
    if (!await this.hasPermission(origin)) {
      throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Site disconnected before paired address access was granted');
    }
    await this.storePairedAddressPermission(origin, walletId, address);
    if (!await this.hasPermission(origin)) {
      await this.clearPairedAddressPermission(origin);
      throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Site disconnected before paired address access was granted');
    }
  }

  /**
   * Get accounts for connected origin
   */
  async getAccounts(origin: string): Promise<string[]> {
    console.debug('[ConnectionService] getAccounts called for origin:', origin);
    
    const walletService = getWalletService();
    const isUnlocked = await walletService.isKeychainUnlocked();
    console.debug('[ConnectionService] Keychain unlocked:', isUnlocked);

    if (!isUnlocked) {
      console.debug('[ConnectionService] Wallet not unlocked, returning empty array');
      return [];
    }

    const activeAddress = await walletService.getActiveAddress();
    console.debug('[ConnectionService] Active address:', activeAddress);
    
    if (!activeAddress) {
      console.debug('[ConnectionService] No active address, returning empty array');
      return [];
    }

    // Check if origin is connected
    const isConnected = await this.hasPermission(origin);
    console.debug('[ConnectionService] Connection check:', { origin, isConnected });
    
    const accounts = isConnected ? [activeAddress.address] : [];
    console.debug('[ConnectionService] Returning accounts:', accounts);
    
    return accounts;
  }

  /**
   * Connect a dApp to the wallet
   */
  async connect(
    origin: string,
    address: string,
    walletId: string,
    pairedAddresses = false
  ): Promise<string[]> {
    console.debug('[ConnectionService] Connecting dApp:', { origin, address, walletId });

    // Validate origin is a valid URL
    try {
      new URL(origin);
    } catch {
      throw new Error('Invalid URL');
    }

    // Check if already connected
    if (await this.hasPermission(origin)) {
      return this.getAccounts(origin);
    }

    // Request user permission
    const approval = await this.requestPermission(origin, address, walletId, pairedAddresses);

    if (approval.approved) {
      await this.grantConnection({
        origin,
        address,
        walletId,
        pairedAddresses: pairedAddresses && approval.updatedParams?.pairedAddresses === true,
      });

      console.debug('[ConnectionService] Connection established, getting accounts');
      const accounts = await this.getAccounts(origin);
      console.debug('[ConnectionService] Accounts to return:', accounts);
      
      return accounts;
    } else {
      throw new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'User denied the request');
    }
  }

  /**
   * Disconnect a dApp from the wallet
   */
  async disconnect(origin: string): Promise<void> {
    return this.withConnectionWriteLock(() => this.disconnectInternal(origin));
  }

  private async disconnectInternal(origin: string): Promise<void> {
    console.debug('[ConnectionService] Disconnecting dApp:', origin);

    // Remove from connected websites and all associated capabilities.
    const walletService = getWalletService();
    await walletService.removeConnectedWebsite(origin);

    // Update cache
    this.state.connectionCache.delete(origin);

    // Track disconnect event
    await analytics.track('connection_disconnected');

    // Emit disconnect events to the webpage
    eventEmitterService.emit('emit-provider-event', {
      origin,
      event: 'accountsChanged',
      data: []
    });
    eventEmitterService.emit('emit-provider-event', {
      origin,
      event: 'disconnect',
      data: {}
    });

    console.debug('[ConnectionService] dApp disconnected:', origin);
  }

  /**
   * Check if origin is connected
   */
  async isConnected(origin: string): Promise<boolean> {
    return this.hasPermission(origin);
  }

  /**
   * Get all connected websites
   */
  async getConnectedWebsites(): Promise<ConnectionStatus[]> {
    const settings = await getWalletService().getSettings();
    const connections: ConnectionStatus[] = [];

    for (const origin of settings.connectedWebsites) {
      const cached = this.state.connectionCache.get(origin);
      connections.push({
        origin,
        isConnected: true,
        connectedAddress: cached?.connectedAddress,
        connectedWallet: cached?.connectedWallet,
        connectionTime: cached?.connectionTime,
        lastActive: cached?.lastActive,
      });
    }

    return connections;
  }

  /**
   * Disconnect all websites
   */
  async disconnectAll(): Promise<void> {
    return this.withConnectionWriteLock(() => this.disconnectAllInternal());
  }

  private async disconnectAllInternal(): Promise<void> {
    const connectedSites = [...(await getWalletService().getSettings()).connectedWebsites];

    // Update settings
    await getWalletService().clearConnectedWebsites();

    // Clear cache
    this.state.connectionCache.clear();

    // Emit disconnect events to all sites
    for (const origin of connectedSites) {
      eventEmitterService.emit('emit-provider-event', {
        origin,
        event: 'accountsChanged',
        data: []
      });
      eventEmitterService.emit('emit-provider-event', {
        origin,
        event: 'disconnect',
        data: {}
      });
    }

    // Track bulk disconnect with count
    await analytics.track('connection_disconnect_all', connectedSites.length);

    console.debug('[ConnectionService] Disconnected all websites:', connectedSites.length);
  }

  /**
   * Perform security checks on origin
   */
  private async performSecurityChecks(origin: string): Promise<void> {
    const now = Date.now();
    const lastCheck = this.state.lastSecurityCheck.get(origin) || 0;

    // Skip if checked recently
    if (now - lastCheck < ConnectionService.SECURITY_CHECK_INTERVAL) {
      return;
    }

    // Update last check time
    this.state.lastSecurityCheck.set(origin, now);
  }

  // BaseService implementation methods

  protected async onInitialize(): Promise<void> {
    // A connect approval can outlive the worker that asked for it, and the grant still means what
    // it meant: the site reads it from accountsChanged or from its next request.
    getApprovalService().registerCompletionHandler(async (request, result) => {
      const { address, walletId, capabilities } = request.params?.[0] ?? {};
      if (!address || !walletId) {
        console.warn('[ConnectionService] Restored connect request is missing its account');
        return;
      }

      await this.grantConnection({
        origin: request.origin,
        address,
        walletId,
        pairedAddresses:
          capabilities?.pairedAddresses === true && result.updatedParams?.pairedAddresses === true,
      });
    });

    console.log('[ConnectionService] Initialized');
  }

  protected async onDestroy(): Promise<void> {
    this.state.connectionCache.clear();
    this.state.lastSecurityCheck.clear();
    this.state.pendingPermissionRequests.clear();
    console.log('[ConnectionService] Destroyed');
  }

  protected getSerializableState(): SerializedConnectionState | null {
    if (this.state.lastSecurityCheck.size === 0) {
      return null;
    }

    // Only security-check timestamps survive restarts. A persisted
    // connection cache could fail open for a just-revoked origin, and
    // restored pending-request keys would outlive their resolvers and
    // block the origin from reconnecting.
    return {
      securityChecks: Array.from(this.state.lastSecurityCheck.entries()).map(
        ([origin, timestamp]) => ({ origin, timestamp })
      ),
    };
  }

  protected hydrateState(state: SerializedConnectionState): void {
    // connections and pendingRequests are deliberately not restored;
    // see getSerializableState
    for (const { origin, timestamp } of state.securityChecks ?? []) {
      this.state.lastSecurityCheck.set(origin, timestamp);
    }

    console.log('[ConnectionService] State restored', {
      securityChecks: this.state.lastSecurityCheck.size,
    });
  }

  protected getStateVersion(): number {
    return ConnectionService.STATE_VERSION;
  }


  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    pendingRequests: number;
    cacheHitRate: number;
  } {
    const now = Date.now();
    let activeConnections = 0;
    
    for (const status of this.state.connectionCache.values()) {
      if (status.isConnected && status.lastActive && 
          now - status.lastActive < ConnectionService.CACHE_TTL) {
        activeConnections++;
      }
    }

    return {
      totalConnections: this.state.connectionCache.size,
      activeConnections,
      pendingRequests: this.state.pendingPermissionRequests.size,
      cacheHitRate: 0, // Would need to track cache hits/misses
    };
  }
}

// Proxy for cross-context communication
import { defineProxyService } from '@/platform/proxy';

export const [registerConnectionService, getConnectionService] = defineProxyService(
  'ConnectionService',
  () => new ConnectionService(),
  { methods: {
    hasPermission: 'read', hasPairedAddressPermission: 'read', getAccounts: 'read',
    isConnected: 'read', getConnectedWebsites: 'read', getStats: 'read',
    disconnect: 'command', disconnectAll: 'command',
  } },
);
