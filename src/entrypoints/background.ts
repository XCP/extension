import { registerWalletService } from '@/services/walletService';
import { registerProviderService } from '@/services/providerService';

export default defineBackground(() => {
  registerWalletService();
  registerProviderService();
});
