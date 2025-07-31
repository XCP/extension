import { BrowserContext, Page } from '@playwright/test';

/**
 * Properly initialize the extension and wait for all services to be ready
 */
export async function initializeExtension(context: BrowserContext): Promise<{
  extensionId: string;
  serviceWorker: any;
}> {
  console.log('[Extension Init] Waiting for service worker...');
  
  // Wait for the service worker to register
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  }
  
  const extensionId = serviceWorker.url().split('/')[2];
  console.log('[Extension Init] Extension ID:', extensionId);
  
  // CRITICAL: Give the service worker time to fully initialize
  // This includes setting up proxy services and message handlers
  console.log('[Extension Init] Waiting for service worker initialization...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Verify the service worker is responsive
  const page = await context.newPage();
  try {
    // Navigate to the extension and verify it loads
    await page.goto(`chrome-extension://${extensionId}/popup.html`, { 
      waitUntil: 'networkidle',
      timeout: 10000 
    });
    
    // Give React time to mount and proxy services to connect
    await page.waitForTimeout(2000);
    
    console.log('[Extension Init] Extension loaded successfully');
  } finally {
    await page.close();
  }
  
  return { extensionId, serviceWorker };
}

/**
 * Wait for proxy service to be ready by checking if we can interact with the extension
 */
export async function waitForProxyServices(page: Page): Promise<void> {
  console.log('[Proxy Services] Waiting for proxy services to initialize...');
  
  // Try to interact with the extension storage to verify background connection
  const isReady = await page.evaluate(async () => {
    try {
      // Try to get storage - this will fail if proxy isn't ready
      const result = await chrome.storage.local.get('appRecords');
      return true;
    } catch (error) {
      console.error('Proxy service not ready:', error);
      return false;
    }
  });
  
  if (!isReady) {
    throw new Error('Proxy services failed to initialize');
  }
  
  console.log('[Proxy Services] Ready');
}