import { registerWalletService } from '@/services/walletService';
import { registerProviderService } from '@/services/providerService';

export default defineBackground(() => {
  registerWalletService();
  registerProviderService();

  // Keep-alive mechanism to prevent service worker termination
  const KEEP_ALIVE_INTERVAL = 25000; // 25 seconds (less than Chrome's 30s timeout)

  function keepAlive() {
    // No-op task to keep the service worker active
    Promise.resolve().then(() => {
      // Minimal promise resolution to register a task
    });
    setTimeout(keepAlive, KEEP_ALIVE_INTERVAL); // Schedule next call
  }

  // Start the keep-alive loop
  setTimeout(keepAlive, KEEP_ALIVE_INTERVAL);

  console.debug('Background script initialized with keep-alive');
});
