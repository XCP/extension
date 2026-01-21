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
  createWalletButton: (page: Page) => page.getByRole('button', { name: /Create.*Wallet/i }),
  importWalletButton: (page: Page) => page.getByRole('button', { name: /Import.*Wallet|Import.*Mnemonic/i }),
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
  addressText: (page: Page) => page.locator('[aria-label="Current address"] .font-mono'),

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
  addressDisplay: (page: Page) => page.locator('[aria-label="Current address"] .font-mono, .font-mono').first(),
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
  walletSelector: (page: Page) => page.locator('header button[aria-label="Select Wallet"]'),
  lockButton: (page: Page) => page.locator('header button[aria-label="Lock Wallet"]'),
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
  broadcastOption: (page: Page) => page.locator('text=Broadcast').first(),
  cancelOrderOption: (page: Page) => page.getByText('Cancel Order'),
  closeDispenserOption: (page: Page) => page.getByText('Close Dispenser', { exact: true }),
  recoverBitcoinOption: (page: Page) => page.getByText('Recover Bitcoin'),
  toolsSection: (page: Page) => page.getByText('Tools'),
  assetsSection: (page: Page) => page.locator('text=Assets').first(),
  addressSection: (page: Page) => page.locator('text=Address').first(),
  dexSection: (page: Page) => page.getByText('DEX'),
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
  // Use specific CSS selectors to avoid matching input values
  validResult: (page: Page) => page.locator('span.text-green-600:has-text("Signature Valid")'),
  invalidResult: (page: Page) => page.locator('span.text-red-600:has-text("Signature Invalid")'),
};

// ============================================================================
// Send Transaction (legacy - use compose.send for new tests)
// ============================================================================

export const send = {
  recipientInput: (page: Page) => page.locator('input[placeholder*="destination" i]').first(),
  amountInput: (page: Page) => page.locator('input[name="amount"], input[placeholder*="amount" i]').first(),
  assetSearch: (page: Page) => page.locator('input[placeholder*="Search"]'),
  sendButton: (page: Page) => page.getByRole('button', { name: /send/i }).last(),
  confirmButton: (page: Page) => page.getByRole('button', { name: 'Confirm' }),
  feeSelector: (page: Page) => page.locator('[data-testid="fee-selector"]'),
};

// ============================================================================
// Compose Flows - Common Elements
// ============================================================================

export const compose = {
  // Common elements across all compose forms
  common: {
    // Form inputs
    destinationInput: (page: Page) => page.locator('input[placeholder*="destination" i]').first(),
    quantityInput: (page: Page) => page.locator('input[name="quantity"], input[placeholder*="amount"]').first(),
    assetSelect: (page: Page) => page.locator('select, [role="combobox"], button:has-text("Select")').first(),

    // Header buttons
    headerBackButton: (page: Page) => page.locator('header button').first(),
    headerCloseButton: (page: Page) => page.locator('header button[aria-label*="close"], header button:has-text("×")').first(),

    // Form navigation buttons
    continueButton: (page: Page) => page.getByRole('button', { name: /continue/i }),
    reviewButton: (page: Page) => page.getByRole('button', { name: /review/i }),
    submitButton: (page: Page) => page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Review")').last(),
    confirmButton: (page: Page) => page.getByRole('button', { name: /confirm/i }),
    cancelButton: (page: Page) => page.getByRole('button', { name: /cancel/i }),
    backButton: (page: Page) => page.locator('button:has-text("Back"), [aria-label*="back"]').first(),

    // Review page elements
    reviewTotal: (page: Page) => page.locator('text=/Total|Amount/i'),
    reviewFee: (page: Page) => page.locator('text=/Fee|sat/i'),
    reviewRecipient: (page: Page) => page.locator('text=/Recipient|To|Destination/i'),

    // Success page elements
    successIcon: (page: Page) => page.locator('[data-testid="success-icon"], svg.text-green-500, .text-green-500'),
    successMessage: (page: Page) => page.locator('text=/Success|Complete|Sent|Broadcast/i'),
    transactionHash: (page: Page) => page.locator('.font-mono').filter({ hasText: /^[a-f0-9]{64}$/i }),
    viewOnExplorerButton: (page: Page) => page.locator('a:has-text("View"), button:has-text("Explorer")').first(),
    doneButton: (page: Page) => page.getByRole('button', { name: /done|close|finish/i }),

    // Error states
    errorMessage: (page: Page) => page.locator('.text-red-500, .text-red-600, [role="alert"], .bg-red-50'),
    errorRetryButton: (page: Page) => page.getByRole('button', { name: /retry|try again/i }),

    // Fee selection
    feeDisplay: (page: Page) => page.locator('text=/Fee|sat/i'),
    feeSlider: (page: Page) => page.locator('input[type="range"]'),
    feeLow: (page: Page) => page.locator('button:has-text("Low"), text=/Low/i'),
    feeMedium: (page: Page) => page.locator('button:has-text("Medium"), text=/Medium/i'),
    feeHigh: (page: Page) => page.locator('button:has-text("High"), text=/High/i'),
    feeCustom: (page: Page) => page.locator('button:has-text("Custom"), input[placeholder*="sat"]'),
  },

  // Send transaction (/compose/send)
  send: {
    recipientInput: (page: Page) => page.locator('input[placeholder*="destination" i]').first(),
    quantityInput: (page: Page) => page.locator('input[name="quantity"]'),
    sendButton: (page: Page) => page.locator('button[aria-label="Send tokens"]'),
    mpmaOption: (page: Page) => page.locator('text=/MPMA|Multiple|recipients/i'),
    addRecipientButton: (page: Page) => page.locator('text=/Add recipient|Multiple addresses/i'),
  },

  // Dispenser operations (/compose/dispenser/*)
  dispenser: {
    // Create dispenser
    mainchainRateInput: (page: Page) => page.locator('input[name*="rate"], input[name*="price"], input[placeholder*="satoshi"]').first(),
    escrowQuantityInput: (page: Page) => page.locator('input[name*="escrow"], input[name*="quantity"]').first(),
    giveQuantityInput: (page: Page) => page.locator('input[name*="give"], input[name*="dispense"]').first(),
    createButton: (page: Page) => page.locator('button:has-text("Create"), button:has-text("Open")').first(),
    // Close dispenser
    hashInput: (page: Page) => page.locator('input[name*="hash"], input[placeholder*="hash"]').first(),
    dispenserSelect: (page: Page) => page.locator('select, [role="combobox"]').first(),
    closeButton: (page: Page) => page.locator('button:has-text("Close")').first(),
    // Dispense (buy from dispenser)
    dispenseAmountInput: (page: Page) => page.locator('input[name*="amount"], input[name*="quantity"], input[type="number"]').first(),
    dispenseButton: (page: Page) => page.locator('button:has-text("Dispense"), button:has-text("Buy")').first(),
  },

  // DEX order operations (/compose/order/*)
  order: {
    // Order form uses AmountWithMaxInput (name="amount") and PriceWithSuggestInput (name="price")
    amountInput: (page: Page) => page.locator('input[name="amount"]').first(),
    priceInput: (page: Page) => page.locator('input[name="price"]').first(),
    quoteAssetSelect: (page: Page) => page.locator('[role="combobox"]').first(),
    buyTab: (page: Page) => page.locator('button:has-text("Buy")').first(),
    sellTab: (page: Page) => page.locator('button:has-text("Sell")').first(),
    expirationInput: (page: Page) => page.locator('input[name*="expir"], select[name*="expir"]').first(),
    createOrderButton: (page: Page) => page.locator('button:has-text("Create Order"), button:has-text("Trade")').first(),
    cancelOrderButton: (page: Page) => page.locator('button:has-text("Cancel")').first(),
    // Legacy selectors for backward compatibility
    giveQuantityInput: (page: Page) => page.locator('input[name="amount"]').first(),
    getQuantityInput: (page: Page) => page.locator('input[name="price"]').first(),
  },

  // Asset issuance (/compose/issuance/*)
  issuance: {
    assetNameInput: (page: Page) => page.locator('input[name*="name"], input[name*="asset"], input[placeholder*="Asset"]').first(),
    quantityInput: (page: Page) => page.locator('input[name*="quantity"], input[name*="amount"]').first(),
    divisibleToggle: (page: Page) => page.locator('input[type="checkbox"], [role="switch"]').first(),
    descriptionInput: (page: Page) => page.locator('textarea, input[name*="description"]').first(),
    issueButton: (page: Page) => page.locator('button:has-text("Continue"), button:has-text("Create"), button:has-text("Issue")').first(),
    lockSupplyButton: (page: Page) => page.locator('button:has-text("Lock")').first(),
    transferOwnershipInput: (page: Page) => page.locator('input[name*="address"], input[name*="destination"]').first(),
  },

  // Broadcast (/compose/broadcast)
  broadcast: {
    messageInput: (page: Page) => page.locator('textarea[name="text"]'),
    broadcastButton: (page: Page) => page.locator('button:has-text("Broadcast"), button[type="submit"]').first(),
    addressOptionsLink: (page: Page) => page.locator('text=/Address.*Option|Options|Configure/i, a[href*="address-options"]').first(),
  },

  // Sweep address (/compose/sweep)
  sweep: {
    destinationInput: (page: Page) => page.locator('input[placeholder*="destination address"]').or(
      page.locator('input[type="text"]').filter({ has: page.locator('..').filter({ hasText: 'Destination' }) })
    ).first(),
    flagsSelect: (page: Page) => page.locator('select[name="flags"]'),
    sweepButton: (page: Page) => page.locator('button:has-text("Sweep"), button[type="submit"]').first(),
  },

  // Dividend distribution (/compose/dividend)
  dividend: {
    assetInput: (page: Page) => page.locator('input[placeholder*="asset"], input[placeholder*="holders"]').first(),
    dividendAssetInput: (page: Page) => page.locator('input[placeholder*="dividend"], input[placeholder*="distribute"]').first(),
    quantityPerUnitInput: (page: Page) => page.locator('input[placeholder*="per unit"], input[placeholder*="amount"]').first(),
    distributeButton: (page: Page) => page.locator('button:has-text("Distribute"), button:has-text("Pay")').first(),
  },

  // Fairminter (/compose/fairminter) and Fairmint (/compose/fairmint)
  fairminter: {
    assetNameInput: (page: Page) => page.locator('input[name*="name"], input[name*="asset"]').first(),
    priceInput: (page: Page) => page.locator('input[name*="price"]').first(),
    maxMintInput: (page: Page) => page.locator('input[name*="max"]').first(),
    createButton: (page: Page) => page.locator('button:has-text("Create"), button:has-text("Start")').first(),
  },
  fairmint: {
    mintButton: (page: Page) => page.locator('button:has-text("Mint"), button:has-text("Participate")').first(),
    quantityInput: (page: Page) => page.locator('input[name*="quantity"], input[type="number"]').first(),
  },

  // UTXO operations (/compose/utxo/*)
  utxo: {
    attachQuantityInput: (page: Page) => page.locator('input[name*="quantity"], input[name*="amount"]').first(),
    attachButton: (page: Page) => page.locator('button:has-text("Attach")').first(),
    detachButton: (page: Page) => page.locator('button:has-text("Detach")').first(),
    moveDestinationInput: (page: Page) => page.locator('input[name*="destination"], input[name*="address"]').first(),
    moveButton: (page: Page) => page.locator('button:has-text("Move")').first(),
  },

  // BTC Pay (/compose/btcpay)
  btcpay: {
    orderSelect: (page: Page) => page.locator('select, [role="combobox"], input[name*="order"]').first(),
    payButton: (page: Page) => page.locator('button:has-text("Pay")').first(),
  },

  // Destroy supply (/compose/destroy)
  destroy: {
    quantityInput: (page: Page) => page.locator('input[name*="quantity"], input[name*="amount"]').first(),
    confirmCheckbox: (page: Page) => page.locator('input[type="checkbox"]').first(),
    destroyButton: (page: Page) => page.locator('button:has-text("Destroy"), button:has-text("Burn")').first(),
  },
};

// ============================================================================
// Select Address
// ============================================================================

export const selectAddress = {
  addressList: (page: Page) => page.locator('[role="radiogroup"]'),
  addressOption: (page: Page, index: number) => page.locator('[role="radio"]').nth(index),
  addAddressButton: (page: Page) => page.getByRole('button', { name: /Add Address/i }),
  chevronButton: (page: Page) => page.locator('[aria-label="Select another address"]'),
  addressLabel: (page: Page, num: number) => page.locator(`text=Address ${num}`),
  copyButton: (page: Page) => page.locator('[title*="Copy"], [aria-label*="Copy"]').first(),
};

// ============================================================================
// Select Wallet
// ============================================================================

export const selectWallet = {
  walletList: (page: Page) => page.locator('[role="radiogroup"]'),
  walletOption: (page: Page, name: string) => page.getByText(name),
  // Target the green full-width button at bottom (not the header icon button)
  // Both have aria-label="Add Wallet", so we filter to the one with visible "Add Wallet" text
  addWalletButton: (page: Page) => page.getByRole('button', { name: /Add Wallet/i }).filter({ hasText: 'Add Wallet' }),
};

// ============================================================================
// Market Page
// ============================================================================

export const market = {
  // Main tabs
  dispensersTab: (page: Page) => page.getByRole('tab', { name: 'Dispensers' }),
  ordersTab: (page: Page) => page.getByRole('tab', { name: 'Orders' }),
  manageTab: (page: Page) => page.getByRole('tab', { name: 'Manage' }),

  // BTC Price page
  btcPriceCard: (page: Page) => page.locator('.bg-white.rounded-lg').first(),
  timeRange1h: (page: Page) => page.locator('text="1H"'),
  timeRange24h: (page: Page) => page.locator('text="24H"'),
  priceChart: (page: Page) => page.locator('canvas').first(),
  refreshButton: (page: Page) => page.locator('button[aria-label*="Refresh"]'),

  // Asset dispensers/orders pages
  pageTitle: (page: Page) => page.locator('text=/Orders|Dispensers/i').first(),
  assetName: (page: Page) => page.locator('text=/XCP|BTC/').first(),
  floorPrice: (page: Page) => page.locator('text=/Floor/i').first(),
  avgPrice: (page: Page) => page.locator('text=/Avg/i').first(),
  lastPrice: (page: Page) => page.locator('text=/Last/i').first(),
  openTab: (page: Page) => page.locator('text="Open"').first(),
  matchedTab: (page: Page) => page.locator('text="Matched"').first(),
  dispensedTab: (page: Page) => page.locator('text="Dispensed"').first(),
  emptyState: (page: Page) => page.locator('text=/No open|No dispensers|No orders/i').first(),
  myOrdersLink: (page: Page) => page.locator('text=/My Orders/i').first(),
  myDispensersLink: (page: Page) => page.locator('text=/My Dispensers/i').first(),
  priceUnitToggle: (page: Page) => page.locator('button[title*="Switch"], [class*="repeat"]').first(),
  loadingState: (page: Page) => page.locator('text=/Loading/i').first(),
  retryButton: (page: Page) => page.locator('text=/Retry|Try Again/i').first(),
  orderCards: (page: Page) => page.locator('[class*="card"]').first(),
};

// ============================================================================
// Security Settings
// ============================================================================

export const securitySettings = {
  currentPasswordInput: (page: Page) => page.locator('input[name="currentPassword"]'),
  newPasswordInput: (page: Page) => page.locator('input[name="newPassword"]'),
  confirmPasswordInput: (page: Page) => page.locator('input[name="confirmPassword"]'),
  changePasswordButton: (page: Page) => page.locator('button:has-text("Change Password")'),
  securityTip: (page: Page) => page.locator('text=/Security Tip/i'),
};

// ============================================================================
// Connected Sites
// ============================================================================

export const connectedSites = {
  emptyState: (page: Page) => page.locator('text=/No connected sites/i'),
  siteList: (page: Page) => page.locator('[role="list"], .space-y-2'),
  disconnectButton: (page: Page) => page.locator('button:has-text("Disconnect")'),
  disconnectAllButton: (page: Page) => page.locator('button[aria-label*="Disconnect all"]'),
};

// ============================================================================
// Pinned Assets
// ============================================================================

export const pinnedAssets = {
  searchInput: (page: Page) => page.locator('input[placeholder*="Search"], input[type="search"]'),
  pinnedSection: (page: Page) => page.locator('text=/Pinned/i').first(),
  searchResultsSection: (page: Page) => page.locator('text=/Search Results/i'),
  emptyState: (page: Page) => page.locator('text=/No pinned assets/i'),
  pinButton: (page: Page) => page.locator('button[aria-label*="Pin"]'),
  unpinButton: (page: Page) => page.locator('button[aria-label*="Unpin"]'),
};

// ============================================================================
// Address History
// ============================================================================

export const addressHistory = {
  transactionList: (page: Page) => page.locator('.space-y-2, [role="list"]').first(),
  emptyState: (page: Page) => page.locator('text=/No Transactions/i'),
  loadingSpinner: (page: Page) => page.locator('text=/Loading transactions/i'),
  pagination: (page: Page) => page.locator('text=/Page [0-9]+ of [0-9]+/i'),
  previousButton: (page: Page) => page.locator('button:has-text("Previous")'),
  nextButton: (page: Page) => page.locator('button:has-text("Next")'),
  viewOnXchainButton: (page: Page) => page.locator('button[aria-label*="XChain"]'),
};

// ============================================================================
// Provider Approval
// ============================================================================

export const providerApproval = {
  // Common approval elements
  approveButton: (page: Page) => page.locator('button:has-text("Approve"), button:has-text("Connect"), button:has-text("Allow")'),
  rejectButton: (page: Page) => page.locator('button:has-text("Reject"), button:has-text("Cancel"), button:has-text("Deny")'),
  siteOrigin: (page: Page) => page.locator('text=/localhost|http|Origin/i'),

  // Transaction approval
  transactionDetails: (page: Page) => page.locator('text=/Amount|Fee|Destination/i'),
  feeDisplay: (page: Page) => page.locator('text=/Fee/i'),

  // PSBT approval
  inputsSection: (page: Page) => page.locator('text=/Input/i'),
  outputsSection: (page: Page) => page.locator('text=/Output/i'),

  // Approval queue
  queueCount: (page: Page) => page.locator('text=/[0-9]+.*request/i'),
  dismissButton: (page: Page) => page.locator('button:has-text("Dismiss"), button:has-text("Clear")'),
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
  // Additional common elements
  headerBackButton: (page: Page) => page.locator('header button').first(),
  helpButton: (page: Page) => page.locator('button[aria-label*="Help"]'),
  refreshButton: (page: Page) => page.locator('button[aria-label*="Refresh"]'),
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
