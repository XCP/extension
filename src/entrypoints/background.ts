import { registerWalletService } from '@/services/walletService';
import { registerProviderService } from '@/services/providerService';

export default defineBackground(() => {
  registerWalletService();
  registerProviderService();
  console.log('Background loaded with keychain and provider services.', { id: browser.runtime.id });
});
