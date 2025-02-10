import { defineProxyService } from '@webext-core/proxy-service';
import { getWalletService } from '@/services/walletService';

export interface ProviderService {
  /**
   * A unified request method following an EIP‑1193–like interface.
   */
  request: (args: { method: string; params?: any[] }) => Promise<any>;
}

function createProviderService(): ProviderService {
  async function request({ method, params }: { method: string; params?: any[] }): Promise<any> {
    const walletService = getWalletService();
    switch (method) {
      case 'xcp':
        return 'todo';
      default:
        throw new Error(`Method ${method} is not supported.`);
    }
  }
  return { request };
}

export const [registerProviderService, getProviderService] = defineProxyService(
  'ProviderService',
  createProviderService
);
