/**
 * ProviderService - Web3 Provider API
 *
 * Main interface for dApp integration, working with:
 * - ConnectionService: Permission and connection management
 * - ApprovalService: User approval workflows
 * - WalletService: Wallet state and cryptographic operations
 *
 * This file admits a request and dispatches it by method. The methods live by behaviour under
 * services/provider:
 * - requestIntake: request size and rate limits, checked before dispatch
 * - requestErrors: the errors a site hears for a refused request
 * - connectionMethods: connect (with setup and unlock waits), accounts, addresses, connection proof
 * - signingMethods: message, transaction and PSBT signing requests
 * - signApproval: the durable signing flow, its approval window and the wait for a decision
 * - chainMethods: balances and broadcast
 */

import { APPROVAL_WINDOW_FAILED_MESSAGE, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { analytics } from '@/platform/fathom';
import { defineProxyService } from '@/platform/proxy';
import { getConnectionService } from '@/services/connectionService';
import { broadcastTransaction, getBalances } from '@/services/provider/chainMethods';
import { getAccounts, getAddresses, requestAccounts } from '@/services/provider/connectionMethods';
import { assertRequestAdmissible, type ProviderRequestParams } from '@/services/provider/requestIntake';
import { signMessage, signPsbt, signPsbts, signTransaction } from '@/services/provider/signingMethods';
import { PROVIDER_SERVICE_NAME, PROVIDER_SERVICE_POLICY } from '@/services/providerServiceClient';
import { getWalletService } from '@/services/walletService';

export type { ProviderRequestParams } from '@/services/provider/requestIntake';
export { SIGN_FLOW_RECOVERY_POLL_MS } from '@/services/provider/signApproval';

export type ProviderResponse = unknown;

export interface ProviderService {
  /**
   * Handle provider requests from dApps
   */
  handleRequest: (origin: string, method: string, params?: ProviderRequestParams) => Promise<ProviderResponse>;

  /**
   * Disconnect an origin (the connected-sites settings page)
   */
  disconnect: (origin: string) => Promise<void>;
}

export function createProviderService(): ProviderService {
  /**
   * Handle provider requests from dApps
   */
  async function handleRequest(origin: string, method: string, params: ProviderRequestParams = []): Promise<ProviderResponse> {
    try {
      await assertRequestAdmissible(origin, method, params);

      // Get services
      const walletService = getWalletService();
      const connectionService = getConnectionService();
      const context = { origin, method, params, walletService, connectionService };
      
      switch (method) {
        // ==================== Connection Methods ====================
        
        case 'xcp_requestAccounts': {
          return await requestAccounts(context);
        }
        
        case 'xcp_accounts': {
          return await getAccounts(origin);
        }
        
        case 'xcp_getAddresses': {
          return await getAddresses(context);
        }

        case 'xcp_chainId': {
          return '0x0'; // Bitcoin mainnet
        }
        
        case 'xcp_getNetwork': {
          return 'mainnet'; // Bitcoin mainnet
        }
        
        case 'xcp_disconnect': {
          await connectionService.disconnect(origin);
          return true;
        }
        
        // ==================== Signing Methods ====================
        
        case 'xcp_signMessage': {
          return await signMessage(context);
        }
        
        case 'xcp_signTransaction': {
          return await signTransaction(context);
        }

        case 'xcp_signPsbts': {
          return await signPsbts(context);
        }

        case 'xcp_signPsbt':
        case 'xcp_signBitcoinPsbt': {
          return await signPsbt(context);
        }

        // ==================== Blockchain Query Methods ====================
        
        case 'xcp_getBalances': {
          return await getBalances(context);
        }
        
        case 'xcp_getAssets': {
          // Not supported - dApps should use Counterparty API directly
          throw new ProviderError(PROVIDER_ERROR_CODES.UNSUPPORTED_METHOD, 'Method xcp_getAssets is not supported. Please use the Counterparty API directly with the connected address.');
        }
        
        case 'xcp_getHistory': {
          // For privacy, we don't allow reading transaction history
          throw new ProviderError(PROVIDER_ERROR_CODES.UNSUPPORTED_METHOD, 'Permission denied - transaction history not available through provider');
        }

        // ==================== Transaction Broadcasting ====================
        
        case 'xcp_broadcastTransaction': {
          return await broadcastTransaction(context);
        }
        
        default:
          throw new ProviderError(PROVIDER_ERROR_CODES.UNSUPPORTED_METHOD, `Unsupported method: ${method}`);
      }
      
    } catch (error) {
      // 4001 is the user's answer (declined, closed or let an approval lapse), not a failure. A
      // declined connection is already counted as request_rejected by the approval service, and the
      // documented site handling (PROVIDER.md) skips 4001 the same way. Counting it here would make
      // provider_error track how often users say no. An approval window that could not be opened
      // is also sent as 4001, but nobody answered it: that one is a failure and is counted.
      if (
        error instanceof ProviderError
        && error.code === PROVIDER_ERROR_CODES.USER_REJECTED
        && error.message !== APPROVAL_WINDOW_FAILED_MESSAGE
      ) throw error;

      // Log error for debugging (safely extract hostname)
      let hostname = origin;
      try { hostname = new URL(origin).hostname; } catch { /* use raw origin */ }
      console.error('[ProviderService] Provider request failed:', {
        origin: hostname,
        method,
        error: (error as Error).message
      });

      await analytics.track('provider_error');

      throw error;
    }
  }
  
  /**
   * Disconnect an origin
   */
  async function disconnect(origin: string): Promise<void> {
    const connectionService = getConnectionService();
    await connectionService.disconnect(origin);
  }

  return {
    handleRequest,
    disconnect,
  };
}

// Register proxy service for cross-context communication
export const [registerProviderService, getProviderService] = defineProxyService(
  PROVIDER_SERVICE_NAME,
  createProviderService,
  PROVIDER_SERVICE_POLICY,
);
