/**
 * Centralized UI selectors for E2E tests
 *
 * WHY THIS FILE EXISTS:
 * - Selectors break when UI changes
 * - Centralizing them means one place to update
 * - Tests read better with semantic names
 *
 * SELECTOR PRIORITY (most to least preferred):
 * 1. data-testid attributes (most stable)
 * 2. ARIA roles with accessible names
 * 3. Form element names
 * 4. Text content (use sparingly)
 * 5. CSS classes (avoid - fragile)
 */

import { Page, Locator } from '@playwright/test';

// ============================================================================
// Onboarding
// ============================================================================

export const onboarding = {
  createWalletButton: (page: Page) => page.getByRole('button', { name: 'Create Wallet' }),
  importWalletButton: (page: Page) => page.getByRole('button', { name: 'Import Wallet' }),
  importPrivateKeyButton: (page: Page) => page.getByRole('button', { name: /Import Private Key/i }),
};

// ============================================================================
// Create Wallet
// ============================================================================

export const createWallet = {
  // Note: This is a clickable card/div, not a button
  revealPhraseCard: (page: Page) => page.locator('text=View 12-word Secret Phrase'),
  savedPhraseCheckbox: (page: Page) => page.getByLabel(/I have saved my secret recovery phrase/),
  passwordInput: (page: Page) => page.locator('input[name="password"]'),
  continueButton: (page: Page) => page.getByRole('button', { name: 'Continue' }),
  mnemonicWord: (page: Page, index: number) => page.locator(`[data-testid="mnemonic-word-${index}"]`),
};

// ============================================================================
// Import Wallet
// ============================================================================

export const importWallet = {
  wordInput: (page: Page, index: number) => page.locator(`input[name="word-${index}"]`),
  savedPhraseCheckbox: (page: Page) => page.getByLabel(/I have saved my secret recovery phrase/),
  passwordInput: (page: Page) => page.locator('input[name="password"]'),
  continueButton: (page: Page) => page.getByRole('button', { name: 'Continue' }),
  privateKeyInput: (page: Page) => page.locator('input[name="private-key"]'),
  backedUpCheckbox: (page: Page) => page.getByLabel(/I have backed up this private key/i),
};

// ============================================================================
// Unlock
// ============================================================================

export const unlock = {
  passwordInput: (page: Page) => page.locator('input[name="password"]'),
  unlockButton: (page: Page) => page.getByRole('button', { name: /unlock/i }),
  errorMessage: (page: Page) => page.locator('[data-testid="unlock-error"]'),
};

// ============================================================================
// Index Page (Dashboard)
// ============================================================================

export const index = {
  // Address display
  currentAddress: (page: Page) => page.locator('[aria-label="Current address"]'),
  addressText: (page: Page) => page.locator('[data-testid="current-address"]'),

  // Tab buttons
  assetsTab: (page: Page) => page.getByRole('button', { name: 'View Assets' }),
  balancesTab: (page: Page) => page.getByRole('button', { name: 'View Balances' }),

  // Action buttons
  sendButton: (page: Page) => page.getByRole('button', { name: /send/i }).first(),
  receiveButton: (page: Page) => page.getByRole('button', { name: /receive/i }).first(),
  historyButton: (page: Page) => page.getByText('History'),

  // Balance display
  btcBalanceRow: (page: Page) => page.locator('.font-medium.text-sm.text-gray-900:has-text("BTC")'),
  xcpBalanceRow: (page: Page) => page.locator('.font-medium.text-sm.text-gray-900:has-text("XCP")'),
};

// ============================================================================
// View Address / Receive Page
// ============================================================================

export const viewAddress = {
  // QR code can be canvas, svg, or img depending on implementation
  qrCode: (page: Page) => page.locator('canvas, svg, img[alt*="QR"], [class*="qr"]').first(),
  addressDisplay: (page: Page) => page.locator('.font-mono').first(),
};

// ============================================================================
// Footer Navigation
// ============================================================================

export const footer = {
  container: (page: Page) => page.locator('div.grid.grid-cols-4').first(),
  walletButton: (page: Page) => footer.container(page).locator('button').nth(0),
  marketButton: (page: Page) => footer.container(page).locator('button').nth(1),
  actionsButton: (page: Page) => footer.container(page).locator('button').nth(2),
  settingsButton: (page: Page) => footer.container(page).locator('button').nth(3),
};

// ============================================================================
// Header
// ============================================================================

export const header = {
  walletSelector: (page: Page) => page.locator('header button').first(),
  lockButton: (page: Page) => page.locator('header button').last(),
};

// ============================================================================
// Settings
// ============================================================================

export const settings = {
  // Main settings options
  addressTypeOption: (page: Page) => page.getByText('Address Type'),
  advancedOption: (page: Page) => page.getByText('Advanced'),
  connectedSitesOption: (page: Page) => page.getByText('Connected Sites'),
  pinnedAssetsOption: (page: Page) => page.getByText('Pinned Assets'),
  securityOption: (page: Page) => page.getByText('Security'),

  // Advanced settings
  autoLockTimer: (page: Page) => page.getByText(/Auto-Lock/i).first(),
  oneMinuteOption: (page: Page) => page.getByText('1 Minute'),
  fiveMinutesOption: (page: Page) => page.getByText('5 Minutes'),
};

// ============================================================================
// Actions Page
// ============================================================================

export const actions = {
  signMessageOption: (page: Page) => page.getByText('Sign Message'),
  verifyMessageOption: (page: Page) => page.getByText('Verify Message'),
  issueAssetOption: (page: Page) => page.getByText('Issue Asset'),
  sweepAddressOption: (page: Page) => page.getByText('Sweep Address'),
};

// ============================================================================
// Sign Message
// ============================================================================

export const signMessage = {
  messageInput: (page: Page) => page.locator('textarea[placeholder*="Enter your message"]'),
  signatureOutput: (page: Page) => page.locator('textarea[placeholder*="Signature will appear"]'),
  signButton: (page: Page) => page.getByRole('button', { name: 'Sign Message' }),
  copyButton: (page: Page) => page.getByRole('button', { name: 'Copy signature' }),
  downloadJsonButton: (page: Page) => page.getByRole('button', { name: 'Download JSON' }),
  signedIndicator: (page: Page) => page.getByText('Signed'),
  characterCount: (page: Page) => page.locator('[data-testid="char-count"]'),
};

// ============================================================================
// Verify Message
// ============================================================================

export const verifyMessage = {
  addressInput: (page: Page) => page.locator('input[placeholder*="Bitcoin address"]'),
  messageInput: (page: Page) => page.locator('textarea[placeholder*="exact message"]'),
  signatureInput: (page: Page) => page.locator('textarea[placeholder*="base64 or hex format"]'),
  verifyButton: (page: Page) => page.getByRole('button', { name: 'Verify Signature' }),
  resetButton: (page: Page) => page.locator('button[aria-label="Reset form"]'),
  uploadJsonButton: (page: Page) => page.getByRole('button', { name: 'Upload JSON' }),
  validResult: (page: Page) => page.getByText('Signature Valid'),
  invalidResult: (page: Page) => page.getByText('Signature Invalid'),
};

// ============================================================================
// Send Transaction
// ============================================================================

export const send = {
  recipientInput: (page: Page) => page.locator('input[name="destination"], input[placeholder*="address"]').first(),
  amountInput: (page: Page) => page.locator('input[name="amount"], input[placeholder*="amount"]').first(),
  assetSearch: (page: Page) => page.locator('input[placeholder*="Search"]'),
  sendButton: (page: Page) => page.getByRole('button', { name: /send/i }).last(),
  confirmButton: (page: Page) => page.getByRole('button', { name: 'Confirm' }),
  feeSelector: (page: Page) => page.locator('[data-testid="fee-selector"]'),
};

// ============================================================================
// Select Address
// ============================================================================

export const selectAddress = {
  addressList: (page: Page) => page.locator('[role="radiogroup"]'),
  addressOption: (page: Page, index: number) => page.locator('[role="radio"]').nth(index),
  addAddressButton: (page: Page) => page.getByRole('button', { name: /Add Address/i }),
};

// ============================================================================
// Select Wallet
// ============================================================================

export const selectWallet = {
  walletList: (page: Page) => page.locator('[role="radiogroup"]'),
  walletOption: (page: Page, name: string) => page.getByText(name),
  addWalletButton: (page: Page) => page.getByRole('button', { name: /Add Wallet/i }),
};

// ============================================================================
// Common / Shared
// ============================================================================

export const common = {
  backButton: (page: Page) => page.getByRole('button', { name: /back/i }),
  cancelButton: (page: Page) => page.getByRole('button', { name: /cancel/i }),
  confirmButton: (page: Page) => page.getByRole('button', { name: /confirm/i }),
  continueButton: (page: Page) => page.getByRole('button', { name: /continue/i }),
  loadingSpinner: (page: Page) => page.locator('[data-testid="loading"]'),
  errorAlert: (page: Page) => page.locator('[role="alert"]'),
  toast: (page: Page) => page.locator('[data-testid="toast"]'),
};

// ============================================================================
// Helper: Navigate via footer
// ============================================================================

export async function navigateTo(
  page: Page,
  section: 'wallet' | 'market' | 'actions' | 'settings'
): Promise<void> {
  const buttons = {
    wallet: footer.walletButton,
    market: footer.marketButton,
    actions: footer.actionsButton,
    settings: footer.settingsButton,
  };

  const expectedUrl = {
    wallet: /index/,
    market: /market/,
    actions: /actions/,
    settings: /settings/,
  };

  await buttons[section](page).click();
  await page.waitForURL(expectedUrl[section], { timeout: 5000 });
}
