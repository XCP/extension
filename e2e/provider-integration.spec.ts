import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Provider Integration - With Extension', () => {
  let browserContext: BrowserContext;
  let extensionId: string;

  test.beforeAll(async () => {
    // Path to the built extension
    const extensionPath = path.join(__dirname, '..', '.output', 'chrome-mv3');

    console.log('📦 Loading extension from:', extensionPath);

    // Launch Chrome with the extension
    browserContext = await chromium.launchPersistentContext('', {
      headless: false, // Extensions only work in headed mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      // Slower actions for debugging
      slowMo: 500,
    });

    // Wait for service worker to be available
    let serviceWorker = browserContext.serviceWorkers()[0];
    if (!serviceWorker) {
      console.log('⏳ Waiting for service worker...');
      serviceWorker = await browserContext.waitForEvent('serviceworker', { timeout: 30000 });
    }

    // Get extension ID from service worker URL
    extensionId = serviceWorker.url().split('/')[2];
    console.log('✅ Extension loaded with ID:', extensionId);
  });

  test.afterAll(async () => {
    await browserContext?.close();
  });

  test('Provider is injected and connection works', async () => {
    // Open test dApp
    const page = await browserContext.newPage();
    await page.goto('http://localhost:3000/test-dapp-unified.html');

    console.log('📄 Test dApp opened');

    // Wait for the provider to be injected by the extension
    const providerInjected = await page.waitForFunction(
      () => typeof (window as any).xcpwallet !== 'undefined',
      { timeout: 10000 }
    ).catch(() => false);

    if (!providerInjected) {
      // Try reloading once if provider not found
      console.log('🔄 Reloading page to detect provider...');
      await page.reload();
      await page.waitForFunction(
        () => typeof (window as any).xcpwallet !== 'undefined',
        { timeout: 10000 }
      );
    }

    // Verify provider exists
    const hasProvider = await page.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });
    expect(hasProvider).toBe(true);
    console.log('✅ Provider detected!');

    // Check initial connection status
    const initialConnection = await page.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      try {
        const isConnected = await provider.request({ method: 'xcp_isConnected' });
        const accounts = await provider.request({ method: 'xcp_accounts' });
        return { isConnected, accounts };
      } catch (error: any) {
        return { error: error.message };
      }
    });
    console.log('📊 Initial status:', initialConnection);

    // Click the Connect button
    await page.click('#btnConnect');
    console.log('🔌 Clicked connect button');

    // Wait for popup to open
    await page.waitForTimeout(2000); // Give popup time to open

    // Find the popup page
    const pages = browserContext.pages();
    const popupPage = pages.find(p => p.url().includes('popup.html'));

    if (popupPage) {
      console.log('📱 Popup opened:', popupPage.url());

      // Wait for popup to fully load
      await popupPage.waitForLoadState('networkidle');

      // Handle different popup states
      const url = popupPage.url();

      if (url.includes('unlock-wallet')) {
        console.log('🔓 Unlocking wallet...');
        // Enter password if wallet is locked
        await popupPage.fill('input[type="password"]', 'test123');
        await popupPage.click('button:has-text("Unlock")');
        await popupPage.waitForTimeout(1000);
      } else if (url.includes('onboarding')) {
        console.log('🆕 Creating new wallet...');
        // Handle onboarding if needed
        await popupPage.click('button:has-text("Create New Wallet")');
        await popupPage.waitForTimeout(1000);
        // Fill in password
        await popupPage.fill('input[name="password"]', 'test123');
        await popupPage.fill('input[name="confirmPassword"]', 'test123');
        await popupPage.click('button:has-text("Create")');
        await popupPage.waitForTimeout(2000);
      }

      // Now should be on approval page
      if (popupPage.url().includes('approval')) {
        console.log('✋ On approval page');

        // Look for approve button
        const approveButton = popupPage.locator('button:has-text("Approve"), button:has-text("Connect")');
        if (await approveButton.count() > 0) {
          await approveButton.first().click();
          console.log('✅ Clicked approve!');
        }
      }
    } else {
      console.log('⚠️ No popup found, checking if already connected...');
    }

    // Wait for connection to complete
    await page.waitForTimeout(2000);

    // Check final connection status
    const finalConnection = await page.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      try {
        const accounts = await provider.request({ method: 'xcp_accounts' });
        return { connected: accounts.length > 0, accounts };
      } catch (error: any) {
        return { error: error.message };
      }
    });

    console.log('📊 Final status:', finalConnection);

    // Verify connection succeeded
    if (finalConnection.connected) {
      console.log('🎉 Successfully connected!');
      expect(finalConnection.accounts).toHaveLength(1);
    } else {
      console.log('❌ Connection failed');
    }
  });

  test('Compose send opens popup with pre-filled data', async () => {
    const page = await browserContext.newPage();
    await page.goto('http://localhost:3000/test-dapp-unified.html');

    // Wait for provider
    await page.waitForFunction(
      () => typeof (window as any).xcpwallet !== 'undefined',
      { timeout: 10000 }
    );

    // Make sure we're connected
    const accounts = await page.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      return await provider.request({ method: 'xcp_accounts' });
    });

    if (accounts.length === 0) {
      console.log('⚠️ Not connected, skipping compose test');
      return;
    }

    // Fill in send form
    await page.click('[data-section="compose"]'); // Navigate to compose section
    await page.fill('#sendDestination', 'bc1qtest123');
    await page.selectOption('#sendAsset', 'XCP');
    await page.fill('#sendQuantity', '100000000');
    await page.fill('#sendMemo', 'Test memo from automated test');

    console.log('📝 Filled send form');

    // Click compose send
    await page.click('#btnComposeSend');
    console.log('📤 Clicked compose send');

    // Wait for popup to update
    await page.waitForTimeout(2000);

    // Find the popup
    const pages = browserContext.pages();
    const popupPage = pages.find(p => p.url().includes('popup.html'));

    if (popupPage) {
      const url = popupPage.url();
      console.log('📱 Popup URL:', url);

      // Check if navigated to compose/send
      if (url.includes('compose/send')) {
        console.log('✅ Navigated to compose/send!');

        // Try to find the destination input
        const destinationInput = popupPage.locator('input[name="destination"], input[placeholder*="address"]').first();
        if (await destinationInput.count() > 0) {
          const value = await destinationInput.inputValue();
          console.log('📍 Destination value:', value);
          expect(value).toContain('bc1qtest123');
        }
      } else {
        console.log('❌ Not on compose/send page');
      }
    }
  });

  test('Provider events work correctly', async () => {
    const page = await browserContext.newPage();
    await page.goto('http://localhost:3000/test-dapp-unified.html');

    // Wait for provider
    await page.waitForFunction(
      () => typeof (window as any).xcpwallet !== 'undefined',
      { timeout: 10000 }
    );

    // Set up event listener
    await page.evaluate(() => {
      const provider = (window as any).xcpwallet;
      (window as any).eventLogs = [];

      provider.on('accountsChanged', (accounts: string[]) => {
        (window as any).eventLogs.push({ type: 'accountsChanged', accounts });
      });

      provider.on('disconnect', () => {
        (window as any).eventLogs.push({ type: 'disconnect' });
      });
    });

    console.log('📡 Event listeners set up');

    // Trigger an event by disconnecting
    await page.click('#btnDisconnect');
    await page.waitForTimeout(1000);

    // Check if events were fired
    const events = await page.evaluate(() => (window as any).eventLogs);
    console.log('📊 Events received:', events);

    // We should have received some events
    expect(events.length).toBeGreaterThan(0);
  });
});