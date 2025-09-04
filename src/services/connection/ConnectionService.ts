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
import { getKeychainSettings, updateKeychainSettings } from '@/utils/storage/settingsStorage';
import { getWalletService } from '@/services/walletService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { connectionRateLimiter } from '@/utils/provider/rateLimiter';
import { analyzeCSP } from '@/utils/security/cspValidation';
import { analytics } from '#analytics';
import { approvalQueue } from '@/utils/provider/approvalQueue';
import type { Address, Wallet } from '@/utils/wallet';

export interface ConnectionStatus {
  origin: string;
  isConnected: boolean;
  connectedAddress?: string;
  connectedWallet?: string;
  connectionTime?: number;
  lastActive?: number;
}

export interface ConnectionPermissionRequest {
  origin: string;
  address: string;
  walletId: string;
  timestamp: number;
}

interface ConnectionServiceState {
  connectionCache: Map<string, ConnectionStatus>;
  lastSecurityCheck: Map<string, number>;
  pendingPermissionRequests: Set<string>;
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
    // Check cache first
    const cached = this.state.connectionCache.get(origin);
    if (cached && Date.now() - (cached.lastActive || 0) < ConnectionService.CACHE_TTL) {
      return cached.isConnected;
    }

    // Check persistent storage
    const settings = await getKeychainSettings();
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

    const requestId = `${origin}-${Date.now()}`;
    this.state.pendingPermissionRequests.add(requestId);

    try {
      // This would integrate with ApprovalService when it's created
      // For now, maintain existing approval queue integration
      
      const promise = new Promise<boolean>((resolve, reject) => {
        // Add to approval queue
        approvalQueue.add({
          id: requestId,
          origin,
          method: 'xcp_requestAccounts',
          params: [],
          type: 'connection',
          metadata: {
            domain: new URL(origin).hostname,
            title: 'Connection Request',
            description: 'This site wants to connect to your wallet',
          },
        });

        // Open approval window
        this.openApprovalWindow(requestId, origin);

        // Handle timeout
        setTimeout(() => {
          if (this.state.pendingPermissionRequests.has(requestId)) {
            this.state.pendingPermissionRequests.delete(requestId);
            approvalQueue.remove(requestId);
            reject(new Error('Permission request timeout'));
          }
        }, 5 * 60 * 1000); // 5 minutes

        // Store resolvers (this would be handled by ApprovalService in the future)
        eventEmitterService.on(`resolve-${requestId}`, (approved: boolean) => {
          this.state.pendingPermissionRequests.delete(requestId);
          approvalQueue.remove(requestId);
          resolve(approved);
        });
      });

      return await promise;
    } catch (error) {
      this.state.pendingPermissionRequests.delete(requestId);
      throw error;
    }
  }

  /**
   * Get accounts for connected origin
   */
  async getAccounts(origin: string): Promise<string[]> {
    console.debug('getAccounts called for origin:', origin);
    
    const walletService = getWalletService();
    const isUnlocked = await walletService.isAnyWalletUnlocked();
    console.debug('Wallet unlocked:', isUnlocked);

    if (!isUnlocked) {
      console.debug('Wallet not unlocked, returning empty array');
      return [];
    }

    const activeAddress = await walletService.getActiveAddress();
    console.debug('Active address:', activeAddress);
    
    if (!activeAddress) {
      console.debug('No active address, returning empty array');
      return [];
    }

    // Check if origin is connected
    const isConnected = await this.hasPermission(origin);
    console.debug('Connection check:', { origin, isConnected });
    
    const accounts = isConnected ? [activeAddress.address] : [];
    console.debug('Returning accounts:', accounts);
    
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
    console.debug('Connecting dApp:', { origin, address, walletId });

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
      const settings = await getKeychainSettings();
      if (!settings.connectedWebsites.includes(origin)) {
        await updateKeychainSettings({
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

      console.debug('Connection established, getting accounts');
      const accounts = await this.getAccounts(origin);
      console.debug('Accounts to return:', accounts);
      
      return accounts;
    } else {
      throw new Error('User denied the request');
    }
  }

  /**
   * Disconnect a dApp from the wallet
   */
  async disconnect(origin: string): Promise<void> {
    console.debug('Disconnecting dApp:', origin);

    // Remove from connected websites
    const settings = await getKeychainSettings();
    const updatedSites = settings.connectedWebsites.filter(site => site !== origin);
    
    await updateKeychainSettings({
      connectedWebsites: updatedSites,
    });

    // Update cache
    this.state.connectionCache.delete(origin);

    // Track disconnect event
    await analytics.track('connection_disconnected', { value: 1 });

    // Emit disconnect events
    eventEmitterService.emitProviderEvent(origin, 'accountsChanged', []);
    eventEmitterService.emitProviderEvent(origin, 'disconnect', {});

    console.debug('dApp disconnected:', origin);
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
    const settings = await getKeychainSettings();
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
    const settings = await getKeychainSettings();
    const connectedSites = [...settings.connectedWebsites];

    // Update settings
    await updateKeychainSettings({ connectedWebsites: [] });

    // Clear cache
    this.state.connectionCache.clear();

    // Emit disconnect events to all sites
    for (const origin of connectedSites) {
      eventEmitterService.emitProviderEvent(origin, 'accountsChanged', []);
      eventEmitterService.emitProviderEvent(origin, 'disconnect', {});
    }

    // Track bulk disconnect
    await analytics.track('connection_disconnect_all', {
      value: connectedSites.length,
    });

    console.debug('Disconnected all websites:', connectedSites.length);
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
    try {
      const cspAnalysis = await analyzeCSP(origin);
      if (!cspAnalysis.hasCSP || cspAnalysis.warnings.length > 0) {
        console.warn('Site has CSP security issues', {
          origin: new URL(origin).hostname,
          hasCSP: cspAnalysis.hasCSP,
          isSecure: cspAnalysis.isSecure,
          warningCount: cspAnalysis.warnings.length,
          warnings: cspAnalysis.warnings.slice(0, 3),
        });
      }
    } catch (error) {
      console.warn('CSP analysis failed', {
        origin: new URL(origin).hostname,
        error: (error as Error).message,
      });
    }

    // Update last check time
    this.state.lastSecurityCheck.set(origin, now);
  }

  /**
   * Open approval window for permission request
   */
  private async openApprovalWindow(requestId: string, origin: string): Promise<void> {
    // This would be handled by ApprovalService in the future
    const currentWindow = approvalQueue.getCurrentWindow();

    if (currentWindow) {
      // Focus existing window
      browser.windows.update(currentWindow, { focused: true }).catch(() => {
        // Window might be closed, open new one
        this.createApprovalWindow();
      });
    } else {
      // Open new approval window
      this.createApprovalWindow();
    }
  }

  /**
   * Create approval window
   */
  private async createApprovalWindow(): Promise<void> {
    const window = await browser.windows.create({
      url: browser.runtime.getURL('/popup.html#/provider/approval-queue'),
      type: 'popup',
      width: 350,
      height: 600,
      focused: true,
    });

    if (window?.id) {
      approvalQueue.setCurrentWindow(window.id);

      // Monitor window close
      browser.windows.onRemoved.addListener(function windowCloseHandler(windowId) {
        if (windowId === window?.id) {
          approvalQueue.setCurrentWindow(null);
          browser.windows.onRemoved.removeListener(windowCloseHandler);
        }
      });
    }
  }

  // BaseService implementation methods

  protected async onInitialize(): Promise<void> {
    console.log('ConnectionService initialized');
  }

  protected async onDestroy(): Promise<void> {
    this.state.connectionCache.clear();
    this.state.lastSecurityCheck.clear();
    this.state.pendingPermissionRequests.clear();
    console.log('ConnectionService destroyed');
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

    console.log('ConnectionService state restored', {
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