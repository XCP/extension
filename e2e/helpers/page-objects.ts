import { Page } from '@playwright/test';

/**
 * Page object for Sign Message page
 */
export class SignMessagePage {
  constructor(private page: Page) {}
  
  get messageInput() {
    return this.page.locator('textarea[placeholder*="message"], textarea[name="message"]');
  }
  
  get signButton() {
    return this.page.getByRole('button', { name: /Sign/i });
  }
  
  get signatureOutput() {
    return this.page.locator('[data-testid="signature"], .font-mono').last();
  }
  
  async signMessage(message: string): Promise<string> {
    await this.messageInput.fill(message);
    await this.signButton.click();
    await this.page.waitForTimeout(1000);
    
    const signature = await this.signatureOutput.textContent();
    return signature || '';
  }
  
  async copySignature() {
    const copyButton = this.page.getByRole('button', { name: 'Copy signature' });
    await copyButton.click();
  }
}

/**
 * Page object for Verify Message page
 */
export class VerifyMessagePage {
  constructor(private page: Page) {}
  
  get addressInput() {
    return this.page.locator('input[placeholder*="address"], input[name="address"]');
  }
  
  get messageInput() {
    return this.page.locator('textarea[placeholder*="message"], textarea[name="message"]');
  }
  
  get signatureInput() {
    return this.page.locator('textarea[placeholder*="signature"], textarea[name="signature"]');
  }
  
  get verifyButton() {
    return this.page.getByRole('button', { name: /Verify/i });
  }
  
  async verifyMessage(address: string, message: string, signature: string): Promise<boolean> {
    await this.addressInput.fill(address);
    await this.messageInput.fill(message);
    await this.signatureInput.fill(signature);
    await this.verifyButton.click();
    await this.page.waitForTimeout(1000);
    
    // Check for success message
    const success = await this.page.locator('text=/Valid|Success|Verified/i').isVisible().catch(() => false);
    return success;
  }
  
  async pasteFromJson(data: { address: string; message: string; signature: string }) {
    const jsonString = JSON.stringify(data);
    const pasteButton = this.page.getByRole('button', { name: /Paste.*JSON/i });
    
    // Set clipboard data
    await this.page.evaluate((text) => navigator.clipboard.writeText(text), jsonString);
    
    // Click paste button
    await pasteButton.click();
    await this.page.waitForTimeout(500);
  }
}

/**
 * Page object for Footer Navigation
 */
export class FooterNav {
  constructor(private page: Page) {}
  
  async navigateTo(section: 'wallet' | 'market' | 'actions' | 'settings') {
    const buttonIndex = {
      'wallet': 0,
      'market': 1,
      'actions': 2,
      'settings': 3
    };
    
    const index = buttonIndex[section];
    const footer = this.page.locator('div.grid.grid-cols-4').first();
    const footerButton = footer.locator('button').nth(index);
    
    await footerButton.click();
    await this.page.waitForTimeout(1000);
  }
}

/**
 * Page object for Index Page
 */
export class IndexPage {
  constructor(private page: Page) {}
  
  get addressDisplay() {
    return this.page.locator('.font-mono').first();
  }
  
  get assetsTab() {
    return this.page.getByRole('button', { name: 'View Assets' });
  }
  
  get balancesTab() {
    return this.page.getByRole('button', { name: 'View Balances' });
  }
  
  get receiveButton() {
    return this.page.getByRole('button', { name: 'Receive tokens' });
  }
  
  get sendButton() {
    return this.page.getByRole('button', { name: 'Send tokens' });
  }
  
  get historyButton() {
    return this.page.getByRole('button', { name: 'Transaction history' });
  }
  
  async switchToAssets() {
    await this.assetsTab.click();
    await this.page.waitForTimeout(500);
  }
  
  async switchToBalances() {
    await this.balancesTab.click();
    await this.page.waitForTimeout(500);
  }
}