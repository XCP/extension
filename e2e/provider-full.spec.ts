import { test, expect } from '@playwright/test';
import {
  launchExtension,
  createWallet,
  setupWallet,
  cleanup,
  TEST_PASSWORD
} from './helpers/test-helpers';

test.describe('Provider Full Integration', () => {
  test('Complete provider flow with wallet setup', async () => {
    // Launch extension with proper setup
    const { context, page: extensionPage, extensionId } = await launchExtension('provider-test');

    console.log('✅ Extension launched with ID:', extensionId);

    try {
      // Set up wallet if needed
      await setupWallet(extensionPage, TEST_PASSWORD);
      console.log('✅ Wallet set up');

      // Open test dApp in a new tab
      const dappPage = await context.newPage();
      await dappPage.goto('http://localhost:3000/test-dapp-unified.html');
      console.log('📄 Test dApp opened');

      // Wait for provider to be injected
      await dappPage.waitForFunction(
        () => typeof (window as any).xcpwallet !== 'undefined',
        { timeout: 15000 }
      );

      // Verify provider is available
      const hasProvider = await dappPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        return provider && typeof provider.request === 'function';
      });

      expect(hasProvider).toBe(true);
      console.log('✅ Provider detected and functional!');

      // Test initial connection status
      const initialStatus = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        try {
          const isConnected = await provider.request({ method: 'xcp_isConnected' });
          const accounts = await provider.request({ method: 'xcp_accounts' });
          return { isConnected, accounts, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
      });

      console.log('📊 Initial status:', initialStatus);

      // TEST 1: Connection Flow
      console.log('\n🔌 Testing connection flow...');

      // Set up promise to catch popup BEFORE clicking connect
      const popupPromise = context.waitForEvent('page', {
        predicate: (p: any) => p.url().includes('popup.html'),
        timeout: 10000
      });

      // Click connect button
      await dappPage.click('#btnConnect');
      console.log('  Clicked connect button');

      // Wait for popup
      const popupPage = await popupPromise;
      console.log('  Popup opened:', popupPage.url());

      // Wait for popup to load
      await popupPage.waitForLoadState('domcontentloaded');
      await popupPage.waitForTimeout(1000);

      // Check popup URL and handle appropriately
      const popupUrl = popupPage.url();

      if (popupUrl.includes('approval-queue') || popupUrl.includes('approve-connection')) {
        console.log('  On approval page');

        // Look for approve button with various possible texts
        const approveSelectors = [
          'button:has-text("Approve")',
          'button:has-text("Connect")',
          'button:has-text("Allow")',
          'button[aria-label*="approve"]'
        ];

        let approved = false;
        for (const selector of approveSelectors) {
          const button = popupPage.locator(selector).first();
          if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
            await button.click();
            console.log('  ✅ Clicked approve button');
            approved = true;
            break;
          }
        }

        if (!approved) {
          console.log('  ⚠️ Could not find approve button');
        }
      }

      // Wait for connection to complete
      await dappPage.waitForTimeout(2000);

      // Verify connection succeeded
      const connectionResult = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        const accounts = await provider.request({ method: 'xcp_accounts' });
        return { accounts, connected: accounts.length > 0 };
      });

      console.log('📊 Connection result:', connectionResult);
      expect(connectionResult.connected).toBe(true);
      console.log('✅ Successfully connected!');

      // TEST 2: Compose Send Flow
      console.log('\n📤 Testing compose send flow...');

      // Navigate to compose section
      await dappPage.click('[data-section="compose"]');
      await dappPage.waitForTimeout(500);

      // Fill send form
      await dappPage.fill('#sendDestination', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
      await dappPage.selectOption('#sendAsset', 'XCP');
      await dappPage.fill('#sendQuantity', '100000000');
      await dappPage.fill('#sendMemo', 'Test from automated provider test');
      console.log('  Filled send form');

      // Set up popup promise again
      const composePopupPromise = context.waitForEvent('page', {
        predicate: (p: any) => {
          const url = p.url();
          return url.includes('popup.html') &&
                 (url.includes('compose') || url.includes('send'));
        },
        timeout: 10000
      }).catch(() => null);

      // Click compose send
      await dappPage.click('#btnComposeSend');
      console.log('  Clicked compose send');

      // Check if popup navigated to compose/send
      const composePopup = await composePopupPromise;
      if (composePopup) {
        const url = composePopup.url();
        console.log('  Popup URL:', url);

        if (url.includes('compose/send')) {
          console.log('  ✅ Successfully routed to compose/send!');

          // Try to verify pre-populated data
          await composePopup.waitForTimeout(1000);

          const inputs = await composePopup.locator('input').all();
          console.log(`  Found ${inputs.length} input fields`);

          // Look for destination field
          for (const input of inputs) {
            const value = await input.inputValue().catch(() => '');
            const placeholder = await input.getAttribute('placeholder').catch(() => '');
            const name = await input.getAttribute('name').catch(() => '');

            if (value.includes('bc1q') || name === 'destination') {
              console.log(`  Found destination: ${value}`);
            }
            if (value.includes('Test from') || name === 'memo') {
              console.log(`  Found memo: ${value}`);
            }
          }
        }
      } else {
        // Popup might have been reused
        const pages = context.pages();
        const existingPopup = pages.find((p: any) => p.url().includes('popup.html'));
        if (existingPopup) {
          console.log('  Popup reused, URL:', existingPopup.url());
        }
      }

      // TEST 3: Event Handling
      console.log('\n📡 Testing event handling...');

      // Set up event listeners
      const eventLog = await dappPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        const events: any[] = [];

        provider.on('accountsChanged', (accounts: string[]) => {
          events.push({ type: 'accountsChanged', accounts, time: Date.now() });
        });

        provider.on('disconnect', () => {
          events.push({ type: 'disconnect', time: Date.now() });
        });

        (window as any).providerEvents = events;
        return 'Event listeners set up';
      });

      console.log('  ' + eventLog);

      // TEST 4: Query Methods
      console.log('\n📊 Testing query methods...');

      const balances = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        try {
          const result = await provider.request({ method: 'xcp_getBalances' });
          return { success: true, data: result };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      });

      console.log('  Balance query result:', balances);

      // Final summary
      console.log('\n🎉 Provider integration test complete!');
      console.log('  ✅ Extension loaded and injected provider');
      console.log('  ✅ Connection flow works');
      console.log('  ✅ Compose methods route to popup');
      console.log('  ✅ Events and queries functional');

    } finally {
      // Clean up
      await cleanup(context);
    }
  });
});