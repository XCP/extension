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

import { BaseService } from '@/services/core/BaseService';
import { getSettings, updateSettings } from '@/utils/storage/settingsStorage';
import { getWalletService } from '@/services/walletService';
import { getApprovalService, type ApprovalResult } from '@/services/approvalService';
import { connectionRateLimiter } from '@/utils/provider/rateLimiter';
import { analyzeCSP } from '@/utils/security/cspValidation';
import { analytics } from '@/utils/fathom';
import { eventEmitterService } from '@/services/eventEmitterService';
import { generateRequestId } from '@/utils/id';

export interface ConnectionStatus {
  origin: string;
  isConnected: boolean;
  connectedAddress?: string;
  connectedWallet?: string;
  connectionTime?: number;
  lastActive?: number;
}

interface ConnectionPermissionRequest {
  origin: string;
  address: string;
  walletId: string;
  timestamp: number;
}

interface ConnectionServiceState {
  connectionCache: Map<string, ConnectionStatus>;
  lastSecurityCheck: Map<string, number>;
  pendingPermissionRequests: Set<string>;
  pendingLookups: Map<string, Promise<boolean>>;
}

interface SerializedConnectionState {
  connections: Array<{ origin: string; status: ConnectionStatus }>;
  securityChecks: Array<{ origin: string; timestamp: number }>;
  pendingRequests: string[];
}

export class ConnectionService extends BaseService {
  private state: ConnectionServiceState = {
    connectionCache: new Map(),
    lastSecurityCheck: new Map(),
    pendingPermissionRequests: new Set(),
    pendingLookups: new Map(),
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
    // Check cache first (fast path)
    const cached = this.state.connectionCache.get(origin);
    const now = Date.now();
    if (cached && now - (cached.lastActive || 0) < ConnectionService.CACHE_TTL) {
      return cached.isConnected;
    }

    // Check if there's already a pending lookup for this origin
    // This prevents redundant storage reads from concurrent callers
    const pending = this.state.pendingLookups.get(origin);
    if (pending) {
      return pending;
    }

    // Start the lookup and track it
    const lookupPromise = this.doPermissionLookup(origin);
    this.state.pendingLookups.set(origin, lookupPromise);

    try {
      return await lookupPromise;
    } finally {
      this.state.pendingLookups.delete(origin);
    }
  }

  /**
   * Perform the actual permission lookup from storage
   */
  private async doPermissionLookup(origin: string): Promise<boolean> {
    const settings = await getSettings();
    const isConnected = settings.connectedWebsites.includes(origin);

    // Update cache
    this.state.connectionCache.set(origin, {
      origin,
      isConnected,
      lastActive: Date.now(),
    });

    return isConnected;
  }

  /**
   * Request permission from user for dApp connection
   */
  async requestPermission(
    origin: string,
    address: string,
    walletId: string
  ): Promise<boolean> {
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
        params: [],
        type: 'connection',
        metadata: {
          domain,
          title: 'Connection Request',
          description: 'This site wants to connect to your wallet',
        },
      });

      this.state.pendingPermissionRequests.delete(dedupeKey);
      this.state.pendingPermissionRequests.delete(requestId);
      return result.approved;
    } catch (error) {
      this.state.pendingPermissionRequests.delete(dedupeKey);
      this.state.pendingPermissionRequests.delete(requestId);
      throw error;
    }
  }

  /**
   * Get accounts for connected origin
   */
  async getAccounts(origin: string): Promise<string[]> {
    console.debug('[ConnectionService] getAccounts called for origin:', origin);
    
    const walletService = getWalletService();
    const isUnlocked = await walletService.isAnyWalletUnlocked();
    console.debug('[ConnectionService] Wallet unlocked:', isUnlocked);

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
    walletId: string
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
    const approved = await this.requestPermission(origin, address, walletId);

    if (approved) {
      // Track successful connection
      await analytics.track('connection_established');

      // Add to connected websites
      const settings = await getSettings();
      if (!settings.connectedWebsites.includes(origin)) {
        await updateSettings({
          connectedWebsites: [...settings.connectedWebsites, origin],
        });
      }

      // Update cache
      this.state.connectionCache.set(origin, {
        origin,
        isConnected: true,
        connectedAddress: address,
        connectedWallet: walletId,
        connectionTime: Date.now(),
        lastActive: Date.now(),
      });

      console.debug('[ConnectionService] Connection established, getting accounts');
      const accounts = await this.getAccounts(origin);
      console.debug('[ConnectionService] Accounts to return:', accounts);
      
      return accounts;
    } else {
      throw new Error('User denied the request');
    }
  }

  /**
   * Disconnect a dApp from the wallet
   */
  async disconnect(origin: string): Promise<void> {
    console.debug('[ConnectionService] Disconnecting dApp:', origin);

    // Remove from connected websites
    const settings = await getSettings();
    const updatedSites = settings.connectedWebsites.filter(site => site !== origin);

    await updateSettings({
      connectedWebsites: updatedSites,
    });

    // Update cache
    this.state.connectionCache.delete(origin);

    // Track disconnect event
    await analytics.track('connection_disconnected', { value: '1' });

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
    const settings = await getSettings();
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
    const settings = await getSettings();
    const connectedSites = [...settings.connectedWebsites];

    // Update settings
    await updateSettings({ connectedWebsites: [] });

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

    // Track bulk disconnect
    await analytics.track('connection_disconnect_all', {
      value: connectedSites.length.toString(),
    });

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

    // CSP analysis (warning only)
    // Safely extract hostname for logging
    let hostname = origin;
    try { hostname = new URL(origin).hostname; } catch { /* use raw origin */ }

    try {
      const cspAnalysis = await analyzeCSP(origin);
      if (!cspAnalysis.hasCSP || cspAnalysis.warnings.length > 0) {
        console.warn('[ConnectionService] Site has CSP security issues', {
          origin: hostname,
          hasCSP: cspAnalysis.hasCSP,
          isSecure: cspAnalysis.isSecure,
          warningCount: cspAnalysis.warnings.length,
          warnings: cspAnalysis.warnings.slice(0, 3),
        });
      }
    } catch (error) {
      console.warn('[ConnectionService] CSP analysis failed', {
        origin: hostname,
        error: (error as Error).message,
      });
    }

    // Update last check time
    this.state.lastSecurityCheck.set(origin, now);
  }

  // BaseService implementation methods

  protected async onInitialize(): Promise<void> {
    console.log('[ConnectionService] Initialized');
  }

  protected async onDestroy(): Promise<void> {
    this.state.connectionCache.clear();
    this.state.lastSecurityCheck.clear();
    this.state.pendingPermissionRequests.clear();
    this.state.pendingLookups.clear();
    console.log('[ConnectionService] Destroyed');
  }

  protected getSerializableState(): SerializedConnectionState | null {
    if (
      this.state.connectionCache.size === 0 &&
      this.state.lastSecurityCheck.size === 0 &&
      this.state.pendingPermissionRequests.size === 0
    ) {
      return null;
    }

    return {
      connections: Array.from(this.state.connectionCache.entries()).map(
        ([origin, status]) => ({ origin, status })
      ),
      securityChecks: Array.from(this.state.lastSecurityCheck.entries()).map(
        ([origin, timestamp]) => ({ origin, timestamp })
      ),
      pendingRequests: Array.from(this.state.pendingPermissionRequests),
    };
  }

  protected hydrateState(state: SerializedConnectionState): void {
    // Restore connection cache
    for (const { origin, status } of state.connections) {
      this.state.connectionCache.set(origin, status);
    }

    // Restore security check timestamps
    for (const { origin, timestamp } of state.securityChecks) {
      this.state.lastSecurityCheck.set(origin, timestamp);
    }

    // Restore pending requests
    for (const requestId of state.pendingRequests) {
      this.state.pendingPermissionRequests.add(requestId);
    }

    console.log('[ConnectionService] State restored', {
      connections: this.state.connectionCache.size,
      securityChecks: this.state.lastSecurityCheck.size,
      pendingRequests: this.state.pendingPermissionRequests.size,
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
import { defineProxyService } from '@/utils/proxy';

export const [registerConnectionService, getConnectionService] = defineProxyService(
  'ConnectionService',
  () => new ConnectionService()
);