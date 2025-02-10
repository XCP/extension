import { defineUnlistedScript } from 'wxt/sandbox';
import { getProviderService } from '@/services/providerService';

export default defineUnlistedScript(() => {
  if ((window as any).xcpwallet) {
    console.warn('xcpwallet is already defined');
    return;
  }

  const provider = getProviderService();

  const xcpwallet = {
    /**
     * A unified request method that delegates to our provider service.
     * Example usage from a dApp:
     *
     *   window.xcpwallet.request({
     *     method: 'eth_requestAccounts',
     *     params: [{ origin: window.location.origin }]
     *   }).then((accounts) => console.log(accounts));
     */
    request: (args: { method: string; params?: any[] }) => {
      return provider.request(args);
    },
  };

  Object.defineProperty(window, 'xcpwallet', {
    value: xcpwallet,
    writable: false,
    configurable: false,
  });
});
