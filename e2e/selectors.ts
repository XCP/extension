/**
 * Centralized UI selectors for E2E tests
 *
 * WHY THIS FILE EXISTS:
 * - Selectors break when UI changes
 * - Centralizing them means one place to update
 * - Tests read better with semantic names
 *
 * SELECTOR PRIORITY (most to least preferred):
 * 1. getByRole with accessible name (best - tests accessibility too)
 * 2. getByLabel for form inputs
 * 3. aria-label attributes (locator('[aria-label="..."]'))
 * 4. Form element names (input[name="..."])
 * 5. getByPlaceholder (acceptable for inputs)
 * 6. getByText (use sparingly - fragile to copy changes)
 *
 * AVOID:
 * - CSS class selectors (.class-name) - break when styling changes
 * - Positional selectors (.nth(), .first()) - break when DOM order changes
 * - Complex chains - hard to debug when they fail
 * - data-testid - prefer semantic/accessible selectors
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
  // Note: This is a clickable card/div with role="button"
  revealPhraseCard: (page: Page) => page.getByRole('button', { name: 'Reveal recovery phrase' }),
  savedPhraseCheckbox: (page: Page) => page.getByLabel(/I have saved my secret recovery phrase/),
  passwordInput: (page: Page) => page.locator('input[name="password"]'),
  continueButton: (page: Page) => page.getByRole('button', { name: 'Continue' }),
  // Mnemonic words are rendered as list items with word number prefix
  mnemonicWord: (page: Page, index: number) => page.locator('li').nth(index),
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
  // Error message uses role="alert" for accessibility
  errorMessage: (page: Page) => page.locator('[role="alert"]'),
};

// ============================================================================
// Index Page (Dashboard)
// ============================================================================

export const index = {
  // Address display - uses aria-label from index.tsx
  currentAddress: (page: Page) => page.locator('[aria-label="Current address"]'),
  // Address text - filter by address pattern (bc1, tb1, 1, 3, m, n prefixes)
  addressText: (page: Page) => page.locator('[aria-label="Current address"]').locator('span, p').filter({ hasText: /^(bc1|tb1|1|3|m|n)[a-zA-Z0-9]/ }).first(),

  // Tab buttons - use aria-label from index.tsx
  assetsTab: (page: Page) => page.locator('button[aria-label="View Assets"]'),
  balancesTab: (page: Page) => page.locator('button[aria-label="View Balances"]'),

  // Action buttons - use aria-label from index.tsx
  sendButton: (page: Page) => page.locator('button[aria-label="Send tokens"]'),
  receiveButton: (page: Page) => page.locator('button[aria-label="Receive tokens"]'),
  historyButton: (page: Page) => page.locator('button[aria-label="Transaction history"]'),

  // Balance display - use text content matching
  btcBalanceRow: (page: Page) => page.getByRole('button').filter({ hasText: 'BTC' }).first(),
  xcpBalanceRow: (page: Page) => page.getByRole('button').filter({ hasText: 'XCP' }).first(),

  // Search input on index page
  searchInput: (page: Page) => page.locator('input[placeholder*="Search"], input[type="search"]').first(),
};

// ============================================================================
// View Address / Receive Page
// ============================================================================

export const viewAddress = {
  // QR code canvas - has aria-label="QR code for {address}"
  qrCode: (page: Page) => page.locator('canvas[aria-label^="QR code for"]'),
  // Address display div (clickable) vs copy button - be specific about element type
  addressDisplay: (page: Page) => page.locator('div[role="button"][aria-label="Copy address"]'),
  copyButton: (page: Page) => page.locator('button[aria-label="Copy address"]'),
};

// ============================================================================
// Footer Navigation
// ============================================================================

export const footer = {
  // Use aria-label attributes from footer.tsx for stable selectors
  walletButton: (page: Page) => page.locator('button[aria-label="Wallet"]'),
  marketButton: (page: Page) => page.locator('button[aria-label="Market"]'),
  actionsButton: (page: Page) => page.locator('button[aria-label="Actions"]'),
  settingsButton: (page: Page) => page.locator('button[aria-label="Settings"]'),
};

// ============================================================================
// Header
// ============================================================================

export const header = {
  walletSelector: (page: Page) => page.locator('header button[aria-label="Select Wallet"]'),
  lockButton: (page: Page) => page.locator('header button[aria-label="Lock Keychain"]'),
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
  resetWalletButton: (page: Page) => page.locator('button:has-text("Reset Wallet")'),
  aboutSection: (page: Page) => page.getByText(/About XCP Wallet/i),
  termsLink: (page: Page) => page.getByText(/Terms of Service/i),

  // Advanced settings
  autoLockTimer: (page: Page) => page.getByText(/Auto-Lock/i).first(),
  oneMinuteOption: (page: Page) => page.getByText('1 Minute'),
  fiveMinutesOption: (page: Page) => page.getByText('5 Minutes'),
  apiUrlInput: (page: Page) => page.locator('input[type="url"], input[placeholder*="URL"], input[placeholder*="api"]').first(),
  unconfirmedTxToggle: (page: Page) => page.getByText(/Unconfirmed.*TX|Use Unconfirmed/i).first(),
  analyticsToggle: (page: Page) => page.getByText(/Analytics|usage data/i).first(),
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
  // Character count displays as "N characters" text
  characterCount: (page: Page) => page.getByText(/\d+ characters/),
};

// ============================================================================
// Verify Message
// ============================================================================

export const verifyMessage = {
  addressInput: (page: Page) => page.getByPlaceholder(/Bitcoin address/i),
  messageInput: (page: Page) => page.getByPlaceholder(/exact message/i),
  signatureInput: (page: Page) => page.getByPlaceholder(/base64 or hex format/i),
  verifyButton: (page: Page) => page.getByRole('button', { name: 'Verify Signature' }),
  resetButton: (page: Page) => page.locator('button[aria-label="Reset form"]'),
  uploadJsonButton: (page: Page) => page.getByRole('button', { name: 'Upload JSON' }),
  // Result indicators - use text content
  validResult: (page: Page) => page.getByText('Signature Valid'),
  invalidResult: (page: Page) => page.getByText('Signature Invalid'),
};

// ============================================================================
// Send Transaction (legacy - use compose.send for new tests)
// ============================================================================

export const send = {
  recipientInput: (page: Page) => page.locator('input[placeholder*="destination" i]').first(),
  amountInput: (page: Page) => page.locator('input[name="quantity"], input[name="amount"]').first(),
  assetSearch: (page: Page) => page.locator('input[placeholder*="Search"]'),
  sendButton: (page: Page) => page.getByRole('button', { name: /send/i }).last(),
  confirmButton: (page: Page) => page.getByRole('button', { name: 'Confirm' }),
  // Fee selector - use the fee slider or fee buttons
  feeSelector: (page: Page) => page.locator('input[type="range"]'),
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

    // Success page elements - use heading text to identify success state
    successHeading: (page: Page) => page.getByRole('heading', { name: /success|complete|sent|broadcast/i }),
    successMessage: (page: Page) => page.getByText(/success|complete|sent|broadcast/i),
    // Transaction hash is 64 hex chars - filter by pattern
    transactionHash: (page: Page) => page.getByText(/^[a-f0-9]{64}$/i),
    viewOnExplorerButton: (page: Page) => page.getByRole('link', { name: /view|explorer/i }),
    doneButton: (page: Page) => page.getByRole('button', { name: /done|close|finish/i }),

    // Error states - prefer role="alert" for accessibility
    errorMessage: (page: Page) => page.locator('[role="alert"]'),
    errorRetryButton: (page: Page) => page.getByRole('button', { name: /retry|try again/i }),

    // Fee selection
    feeDisplay: (page: Page) => page.locator('text=/Fee|sat/i'),
    feeSlider: (page: Page) => page.locator('input[type="range"]'),
    feeLow: (page: Page) => page.locator('button:has-text("Low")').or(page.locator('text=/Low/i')),
    feeMedium: (page: Page) => page.locator('button:has-text("Medium")').or(page.locator('text=/Medium/i')),
    feeHigh: (page: Page) => page.locator('button:has-text("High")').or(page.locator('text=/High/i')),
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
    // Create dispenser - use exact names from dispenser form.tsx
    mainchainRateInput: (page: Page) => page.locator('input[name="mainchainrate_display"], input[name*="mainchainrate"], input[name*="rate"]').first(),
    escrowQuantityInput: (page: Page) => page.locator('input[name="escrow_quantity_display"], input[name*="escrow"]').first(),
    giveQuantityInput: (page: Page) => page.locator('input[name="give_quantity_display"], input[name*="give_quantity"]').first(),
    createButton: (page: Page) => page.locator('button:has-text("Create"), button:has-text("Open"), button:has-text("Continue")').first(),
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
    divisibleToggle: (page: Page) => page.locator('input[name="divisible"], [role="switch"][name="divisible"], [role="checkbox"]').first(),
    descriptionInput: (page: Page) => page.locator('textarea, input[name*="description"]').first(),
    issueButton: (page: Page) => page.locator('button:has-text("Continue"), button:has-text("Create"), button:has-text("Issue")').first(),
    lockSupplyButton: (page: Page) => page.locator('button:has-text("Lock")').first(),
    transferOwnershipInput: (page: Page) => page.locator('input[name*="address"], input[name*="destination"]').first(),
  },

  // Broadcast (/compose/broadcast)
  broadcast: {
    messageInput: (page: Page) => page.locator('textarea[name="text"]'),
    broadcastButton: (page: Page) => page.locator('button:has-text("Broadcast"), button[type="submit"]').first(),
    addressOptionsLink: (page: Page) => page.locator('text=/Address.*Option|Options|Configure/i').or(page.locator('a[href*="address-options"]')).first(),
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
  // Target the main Add Address button (green, full-width at bottom)
  // Use aria-label for stability, filter to the visible full-width one
  addAddressButton: (page: Page) => page.locator('button[aria-label="Add Address"]').filter({ hasText: 'Add Address' }),
  // Header Add button (icon only, no text)
  headerAddButton: (page: Page) => page.locator('header button[aria-label="Add Address"]'),
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
  btcPriceTitle: (page: Page) => page.getByText(/Bitcoin Price/i).first(),
  priceChart: (page: Page) => page.locator('canvas[aria-label="Price chart"]'),
  timeRange1h: (page: Page) => page.getByRole('button', { name: '1H' }),
  timeRange24h: (page: Page) => page.getByRole('button', { name: '24H' }),
  refreshButton: (page: Page) => page.locator('button[aria-label*="Refresh"]'),

  // Asset dispensers/orders pages - main heading
  pageTitle: (page: Page) => page.getByRole('heading', { level: 1 }),
  assetName: (page: Page) => page.getByText(/XCP|BTC/).first(),
  floorPrice: (page: Page) => page.getByText(/Floor/i).first(),
  avgPrice: (page: Page) => page.getByText(/Avg/i).first(),
  lastPrice: (page: Page) => page.getByText(/Last/i).first(),
  // Order tabs (Buy/Sell/Matched)
  buyTab: (page: Page) => page.locator('button').filter({ hasText: /^Buy$/ }).first(),
  sellTab: (page: Page) => page.locator('button').filter({ hasText: /^Sell$/ }).first(),
  matchedTab: (page: Page) => page.locator('button').filter({ hasText: /^Matched$/ }).first(),
  // Dispenser tabs (Open/Dispensed)
  openTab: (page: Page) => page.locator('button').filter({ hasText: /^Open$/ }).first(),
  dispensedTab: (page: Page) => page.locator('button').filter({ hasText: /^Dispensed$/ }).first(),
  emptyState: (page: Page) => page.getByText(/No open|No dispensers|No orders/i).first(),
  myOrdersLink: (page: Page) => page.getByText(/My Orders/i).first(),
  myDispensersLink: (page: Page) => page.getByText(/My Dispensers/i).first(),
  priceUnitToggle: (page: Page) => page.locator('button[aria-label*="Switch price"]').first(),
  loadingState: (page: Page) => page.getByText(/Loading/i).first(),
  retryButton: (page: Page) => page.getByRole('button', { name: /Retry|Try Again/i }),
  // Order/dispenser cards in list views
  orderCards: (page: Page) => page.getByRole('listitem').or(page.locator('[role="button"]').filter({ hasText: /BTC|XCP/ })).first(),
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
  emptyState: (page: Page) => page.getByText(/No connected sites/i),
  siteList: (page: Page) => page.getByRole('list'),
  disconnectButton: (page: Page) => page.getByRole('button', { name: /Disconnect/i }),
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
  transactionList: (page: Page) => page.getByRole('list').first(),
  emptyState: (page: Page) => page.getByText(/No Transactions/i),
  loadingSpinner: (page: Page) => page.getByText(/Loading transactions/i),
  pagination: (page: Page) => page.getByText(/Page \d+ of \d+/i),
  previousButton: (page: Page) => page.getByRole('button', { name: 'Previous' }),
  nextButton: (page: Page) => page.getByRole('button', { name: 'Next' }),
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
// Secrets Pages (Show Passphrase / Show Private Key)
// ============================================================================

export const secrets = {
  // Show passphrase page
  showPassphraseTitle: (page: Page) => page.getByText(/Show.*Passphrase|View.*Seed|Recovery/i).first(),
  revealButton: (page: Page) => page.locator('button:has-text("Reveal"), button:has-text("Show")').first(),
  mnemonicDisplay: (page: Page) => page.locator('text=/word|phrase|mnemonic/i').first(),
  copyButton: (page: Page) => page.locator('button[aria-label*="Copy"]').first(),

  // Show private key page
  showPrivateKeyTitle: (page: Page) => page.getByText(/Show.*Private.*Key|Export.*Key/i).first(),
  privateKeyDisplay: (page: Page) => page.getByText(/Private Key|WIF/i).first(),
  warningMessage: (page: Page) => page.getByText(/never share|keep.*secret|dangerous/i).first(),
};

// ============================================================================
// Error States
// ============================================================================

export const errors = {
  notFound: (page: Page) => page.getByText(/Not Found/i).first(),
  unableToLoad: (page: Page) => page.getByText(/Unable to load|error/i).first(),
  invalidPassword: (page: Page) => page.getByText(/Invalid.*password|Incorrect.*password|Wrong.*password/i).first(),
  genericError: (page: Page) => page.getByText(/incorrect|invalid|wrong|error/i).first(),
};

// ============================================================================
// Common / Shared
// ============================================================================

export const common = {
  backButton: (page: Page) => page.getByRole('button', { name: /back/i }),
  cancelButton: (page: Page) => page.getByRole('button', { name: /cancel/i }),
  confirmButton: (page: Page) => page.getByRole('button', { name: /confirm/i }),
  continueButton: (page: Page) => page.getByRole('button', { name: /continue/i }),
  // Spinner component uses role="status" for accessibility
  loadingSpinner: (page: Page) => page.locator('[role="status"]'),
  errorAlert: (page: Page) => page.locator('[role="alert"]'),
  // Header back button - use aria-label when available
  headerBackButton: (page: Page) => page.locator('header button[aria-label="Go Back"]'),
  helpButton: (page: Page) => page.locator('button[aria-label*="Help"]'),
  refreshButton: (page: Page) => page.locator('button[aria-label*="Refresh"]'),

  // Common action buttons
  removeButton: (page: Page) => page.locator('button').filter({ hasText: /Remove/i }),
  deleteButton: (page: Page) => page.getByRole('button', { name: /delete/i }),
  saveButton: (page: Page) => page.getByRole('button', { name: /save/i }),
  submitButton: (page: Page) => page.locator('button[type="submit"]'),
};

