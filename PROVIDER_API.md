# XCP Wallet Provider API Documentation

## Overview

The XCP Wallet extension provides a comprehensive Web3-style provider API that allows websites to interact with the Counterparty protocol on Bitcoin. Unlike traditional approval popups, our extension routes all operations through familiar UI forms where users can review and modify requests before signing.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Connection Management](#connection-management)
3. [Account Methods](#account-methods)
4. [Compose Methods](#compose-methods)
5. [Signing Methods](#signing-methods)
6. [Query Methods](#query-methods)
7. [Error Handling](#error-handling)
8. [Event System](#event-system)
9. [Edge Cases & Recovery](#edge-cases--recovery)
10. [Example Implementation](#example-implementation)

## Getting Started

### Checking for Extension

```javascript
if (typeof window.xcpwallet !== 'undefined') {
  console.log('XCP Wallet is installed!');
} else {
  console.log('Please install XCP Wallet extension');
}
```

### Basic Setup

```javascript
const provider = window.xcpwallet;

// All methods return promises
async function interact() {
  try {
    const result = await provider.request({
      method: 'method_name',
      params: [/* parameters */]
    });
    console.log('Success:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

## Connection Management

### xcp_connect

Requests permission to connect to the wallet. Users see a connection approval screen.

```javascript
const connected = await provider.request({
  method: 'xcp_connect',
  params: []
});
// Returns: boolean (true if approved, throws if rejected)
```

### xcp_disconnect

Disconnects the website from the wallet.

```javascript
await provider.request({
  method: 'xcp_disconnect',
  params: []
});
// Returns: void
```

### xcp_isConnected

Check current connection status without prompting user.

```javascript
const isConnected = await provider.request({
  method: 'xcp_isConnected',
  params: []
});
// Returns: boolean
```

## Account Methods

### xcp_requestAccounts

Get the currently connected account. Prompts for connection if not connected.

```javascript
const accounts = await provider.request({
  method: 'xcp_requestAccounts',
  params: []
});
// Returns: string[] (array with one address)
// Example: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa']
```

### xcp_accounts

Get accounts without prompting (returns empty if not connected).

```javascript
const accounts = await provider.request({
  method: 'xcp_accounts',
  params: []
});
// Returns: string[] (empty if not connected)
```

## Compose Methods

All compose methods open the extension's native UI with pre-populated data. Users can review and modify before signing.

### Common Response Format

All compose methods return a transaction result object:

```javascript
{
  result: {
    rawtransaction: "hex...",
    tx_hash: "abc123...",
    btc_fee: 5000,
    data: "...",
    broadcast?: { // Only after broadcast
      txid: "def456...",
      success: true
    }
  }
}
```

### xcp_composeSend

Send assets to an address.

```javascript
const result = await provider.request({
  method: 'xcp_composeSend',
  params: [{
    // Required parameters
    destination: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr', // Recipient address
    asset: 'XCP',                                      // Asset to send
    quantity: 100000000,                               // Amount (satoshis for BTC, base units for others)

    // Optional parameters
    memo: 'Payment for services',                      // Text memo (optional)
    memo_is_hex: false                                 // Whether memo is hex encoded (optional, default: false)
  }]
});
```

### xcp_composeOrder

Create a DEX order.

```javascript
const result = await provider.request({
  method: 'xcp_composeOrder',
  params: [{
    // Required parameters
    give_asset: 'XCP',                                 // Asset to offer
    give_quantity: 100000000,                          // Amount to offer (base units)
    get_asset: 'PEPECASH',                             // Asset to receive
    get_quantity: 1000,                                // Amount to receive (base units)
    expiration: 1000,                                  // Blocks until expiration

    // Optional parameters
    fee_required: 0                                    // BTC fee required from counterparty (optional, default: 0)
  }]
});
```

### xcp_composeDispenser

Create a token dispenser.

```javascript
const result = await provider.request({
  method: 'xcp_composeDispenser',
  params: [{
    // Required parameters
    asset: 'MYTOKEN',                                  // Asset to dispense
    give_quantity: 100,                                // Amount per dispense (base units)
    escrow_quantity: 10000,                            // Total amount to escrow
    mainchainrate: 100000,                             // Satoshis per base unit of asset

    // Optional parameters
    status: 0,                                         // 0=open, 10=closed (optional, default: 0)
    open_address: '1AddressXXX',                       // Address that can open dispenser (optional)
    oracle_address: '1OracleXXX'                       // Oracle for price feed (optional)
  }]
});
```

### xcp_composeDispense

Dispense from a dispenser.

```javascript
const result = await provider.request({
  method: 'xcp_composeDispense',
  params: [{
    // Required parameters
    dispenser: '1DispenserAddressXXXXXXXXXXXXX',      // Dispenser address
    quantity: 100                                      // Amount to dispense (base units)
  }]
});
```

### xcp_composeDividend

Distribute dividends to token holders.

```javascript
const result = await provider.request({
  method: 'xcp_composeDividend',
  params: [{
    // Required parameters
    asset: 'MYTOKEN',                                  // Token whose holders receive dividend
    dividend_asset: 'XCP',                             // Asset to distribute as dividend
    quantity_per_unit: 1000                            // Amount per base unit of holding asset
  }]
});
```

### xcp_composeIssuance

Issue a new asset or modify an existing one.

```javascript
const result = await provider.request({
  method: 'xcp_composeIssuance',
  params: [{
    // Required parameters
    asset: 'MYTOKEN',                                  // Asset name (A12345... for numeric)
    quantity: 1000000,                                 // Initial supply (0 for no supply)
    divisible: true,                                   // Whether divisible (8 decimal places)

    // Optional parameters
    lock: false,                                       // Lock supply after issuance (optional, default: false)
    reset: false,                                      // Reset supply to quantity (optional, default: false)
    description: 'My awesome token',                   // Asset description (optional)
    transfer_destination: '1NewOwnerXXX',              // Transfer ownership to (optional)
    inscription: 'base64EncodedData',                  // Inscription data (optional)
    mime_type: 'image/png'                             // MIME type for inscription (optional)
  }]
});
```

### xcp_composeSweep

Sweep all assets from an address.

```javascript
const result = await provider.request({
  method: 'xcp_composeSweep',
  params: [{
    // Required parameters
    destination: '1DestinationAddressXXXXXXXXXX',     // Destination for all assets
    flags: 1,                                          // Sweep flags (1=regular, 2=UTXO, 3=all balances)

    // Optional parameters
    memo: 'Consolidating funds'                        // Memo text (optional)
  }]
});
```

### xcp_composeBroadcast

Broadcast a message to the network.

```javascript
const result = await provider.request({
  method: 'xcp_composeBroadcast',
  params: [{
    // Required parameters
    text: 'MYTOKEN is now trading!',                   // Broadcast text

    // Optional parameters
    value: '0',                                        // Numeric value for betting feeds (optional)
    fee_fraction: '0',                                 // Fee fraction as decimal (optional)
    timestamp: Math.floor(Date.now() / 1000),          // Unix timestamp (optional, default: current)
    inscription: 'base64EncodedData',                  // Inscription data (optional)
    mime_type: 'text/plain'                            // MIME type for inscription (optional)
  }]
});
```

### xcp_composeBTCPay

Pay for a BTC order match (when selling BTC for another asset).

```javascript
const result = await provider.request({
  method: 'xcp_composeBTCPay',
  params: [{
    order_match_id: 'abc123...def456' // Order match ID to pay for
  }]
});
```

### xcp_composeCancel

Cancel an open order on the DEX.

```javascript
const result = await provider.request({
  method: 'xcp_composeCancel',
  params: [{
    offer_hash: 'abc123...' // Hash of the order to cancel
  }]
});
```

### xcp_composeDestroy

Destroy (burn) supply of an asset you control.

```javascript
const result = await provider.request({
  method: 'xcp_composeDestroy',
  params: [{
    // Required parameters
    asset: 'MYTOKEN',                                  // Asset to destroy
    quantity: 1000,                                    // Amount to destroy (base units)

    // Optional parameters
    tag: 'cleanup'                                     // Tag for the destruction (optional)
  }]
});
```

### xcp_composeBet

Create a bet (binary option) on a broadcast feed.

```javascript
const result = await provider.request({
  method: 'xcp_composeBet',
  params: [{
    // Required parameters
    feed_address: '1FeedAddressXXXXXXXXXXXXXXX',      // Address of broadcast feed
    bet_type: 0,                                       // 0=BullCFD, 1=BearCFD, 2=Equal, 3=NotEqual
    deadline: 1234567890,                              // Unix timestamp for deadline
    wager_quantity: 100000000,                         // Amount to wager (in XCP)
    counterwager_quantity: 100000000,                  // Amount for counterparty
    expiration: 1000,                                  // Blocks until expiration

    // Optional parameters
    leverage: 5040,                                    // Leverage for CFDs (optional, default: 5040)
    target_value: 1.0                                  // Target value for Equal/NotEqual (optional)
  }]
});
```

### xcp_composeFairminter

Create a fairminter for fair token distribution.

```javascript
const result = await provider.request({
  method: 'xcp_composeFairminter',
  params: [{
    // Required parameters
    asset: 'FAIRTOKEN',                                // Asset to create fairminter for

    // Optional parameters
    price: 100000,                                     // Satoshis per token (optional)
    quantity_by_price: 1,                              // Tokens per price unit (optional)
    max_mint_per_tx: 10000,                            // Max mint per transaction (optional)
    hard_cap: 1000000000,                              // Maximum supply (optional)
    premint_quantity: 100000,                          // Pre-mint for creator (optional)
    start_block: 850000,                               // Start block (optional)
    end_block: 860000,                                 // End block (optional)
    soft_cap: 500000000,                               // Soft cap amount (optional)
    soft_cap_deadline_block: 855000,                   // Soft cap deadline (optional)
    minted_asset_commission: 5,                        // Commission percentage (optional)
    burn_payment: false,                               // Burn payment instead of sending (optional)
    lock_description: false,                           // Lock description after creation (optional)
    lock_quantity: false,                              // Lock quantity after creation (optional)
    divisible: true,                                   // Whether divisible (optional)
    description: 'Fair launch token',                  // Asset description (optional)
    inscription: 'base64EncodedData',                  // Inscription data (optional)
    mime_type: 'image/png'                             // MIME type for inscription (optional)
  }]
});
```

### xcp_composeFairmint

Mint tokens from a fairminter.

```javascript
const result = await provider.request({
  method: 'xcp_composeFairmint',
  params: [{
    // Required parameters
    asset: 'FAIRTOKEN',                                // Asset to mint from fairminter

    // Optional parameters
    quantity: 1000                                     // Specific quantity to mint (optional, uses default if not specified)
  }]
});
```

### xcp_composeAttach

Attach assets to a specific UTXO (advanced feature).

```javascript
const result = await provider.request({
  method: 'xcp_composeAttach',
  params: [{
    // Required parameters
    asset: 'MYTOKEN',                                  // Asset to attach
    quantity: 1000,                                    // Amount to attach (base units)

    // Optional parameters (Note: destination_vout and utxo_value have special restrictions)
    destination_vout: 1,                               // Output index to attach to (optional)
    utxo_value: 546                                    // UTXO value in satoshis (disabled after block 871900)
  }]
});
```

### xcp_composeDetach

Detach assets from a UTXO to make them spendable.

```javascript
const result = await provider.request({
  method: 'xcp_composeDetach',
  params: [{
    // Note: The source UTXO is determined from the active address
    // Optional parameters
    destination: '1DestinationAddressXXXXXXXXX'       // Destination address (optional, defaults to UTXO's address)
  }]
});
```

### xcp_composeMoveUTXO

Move a UTXO to a new address (UTXO management).

```javascript
const result = await provider.request({
  method: 'xcp_composeMoveUTXO',
  params: [{
    // Required parameters
    destination: '1NewAddressXXXXXXXXXXXXXXX'         // Address to move UTXO to
    // Note: The source UTXO is determined from the active address
  }]
});
```

### xcp_composeIssueSupply

Issue additional supply of an unlocked asset.

```javascript
const result = await provider.request({
  method: 'xcp_composeIssueSupply',
  params: [{
    asset: 'MYTOKEN',
    quantity: 1000000 // Additional supply to issue
  }]
});
```

### xcp_composeLockSupply

Lock the supply of an asset (prevent future issuance).

```javascript
const result = await provider.request({
  method: 'xcp_composeLockSupply',
  params: [{
    asset: 'MYTOKEN'
  }]
});
```

### xcp_composeResetSupply

Reset the supply of an asset to a specific amount.

```javascript
const result = await provider.request({
  method: 'xcp_composeResetSupply',
  params: [{
    asset: 'MYTOKEN',
    quantity: 1000000 // New total supply
  }]
});
```

### xcp_composeTransfer

Transfer ownership of an asset to another address.

```javascript
const result = await provider.request({
  method: 'xcp_composeTransfer',
  params: [{
    asset: 'MYTOKEN',
    destination: '1NewOwnerAddressXXXXXXXXXX'
  }]
});
```

### xcp_composeUpdateDescription

Update the description of an unlocked asset.

```javascript
const result = await provider.request({
  method: 'xcp_composeUpdateDescription',
  params: [{
    asset: 'MYTOKEN',
    description: 'Updated token description'
  }]
});
```

### xcp_composeLockDescription

Lock an asset's description (prevent future changes).

```javascript
const result = await provider.request({
  method: 'xcp_composeLockDescription',
  params: [{
    asset: 'MYTOKEN'
  }]
});
```

### xcp_composeDispenserCloseByHash

Close a specific dispenser by its hash.

```javascript
const result = await provider.request({
  method: 'xcp_composeDispenserCloseByHash',
  params: [{
    dispenser_hash: 'abc123...' // Hash of dispenser to close
  }]
});
```

## Signing Methods

### xcp_signMessage

Sign a message with the active address. Opens sign message UI for user review.

```javascript
const signature = await provider.request({
  method: 'xcp_signMessage',
  params: ['Hello, World!'] // Message to sign
});
// Returns: string (base64 signature)
```

### xcp_signTransaction (Deprecated)

This method is deprecated for security reasons. Use compose methods instead for transparent transaction creation.

## Query Methods

### xcp_getBalances

Get BTC and XCP balances for the active address.

```javascript
const balances = await provider.request({
  method: 'xcp_getBalances',
  params: []
});
// Returns:
// {
//   address: '1Address...',
//   btc: {
//     confirmed: 100000000,
//     unconfirmed: 0,
//     total: 100000000
//   },
//   xcp: 1000.5
// }
```

## Error Handling

### Error Types

```javascript
try {
  const result = await provider.request({ method: 'xcp_composeSend', params: [...] });
} catch (error) {
  if (error.message.includes('User denied')) {
    // User rejected the request
  } else if (error.message.includes('not connected')) {
    // Need to connect first
  } else if (error.message.includes('timeout')) {
    // Request timed out (user walked away)
  } else if (error.message.includes('Popup closed')) {
    // User closed popup without completing
  }
}
```

### Common Error Codes

- `4001` - User rejected request
- `4100` - Unauthorized (not connected)
- `4200` - Unsupported method
- `-32602` - Invalid parameters
- `-32603` - Internal error

## Event System

### accountsChanged

Fired when the active account changes.

```javascript
provider.on('accountsChanged', (accounts) => {
  if (accounts.length === 0) {
    // Wallet locked or disconnected
  } else {
    // Account changed to accounts[0]
  }
});
```

### disconnect

Fired when the website is disconnected.

```javascript
provider.on('disconnect', () => {
  console.log('Disconnected from wallet');
});
```

## Edge Cases & Recovery

### Request Timeout

Requests timeout after 2 minutes of inactivity:

```javascript
try {
  const result = await provider.request({
    method: 'xcp_composeSend',
    params: [...]
  });
} catch (error) {
  if (error.message.includes('timeout')) {
    // Request timed out - user walked away
    // The request is cancelled automatically
  }
}
```

### Popup Closed

If the user closes the popup without completing:

```javascript
try {
  const result = await provider.request({ method: 'xcp_composeSend', params: [...] });
} catch (error) {
  if (error.message.includes('Popup closed unexpectedly')) {
    // User closed popup - request cancelled after 5 second grace period
  }
}
```

### Wallet Lock

If the wallet locks during a request:
- The request remains pending for up to 5 minutes
- User sees a recovery prompt when they unlock
- They can resume or cancel the request

### Request Recovery

When users return after closing/locking:
1. Extension checks for pending requests
2. Shows recovery prompt with request details
3. User can resume where they left off or cancel

## Example Implementation

### Complete Integration Example

```javascript
class XCPWalletClient {
  constructor() {
    this.provider = window.xcpwallet;
    this.connected = false;
    this.account = null;
  }

  async init() {
    if (!this.provider) {
      throw new Error('XCP Wallet not installed');
    }

    // Check if already connected
    this.connected = await this.provider.request({
      method: 'xcp_isConnected',
      params: []
    });

    if (this.connected) {
      await this.getAccount();
    }

    // Set up event listeners
    this.setupEventListeners();
  }

  async connect() {
    try {
      const result = await this.provider.request({
        method: 'xcp_connect',
        params: []
      });

      if (result) {
        this.connected = true;
        await this.getAccount();
        return true;
      }
    } catch (error) {
      console.error('Connection failed:', error);
      return false;
    }
  }

  async getAccount() {
    try {
      const accounts = await this.provider.request({
        method: 'xcp_accounts',
        params: []
      });

      this.account = accounts[0] || null;
      return this.account;
    } catch (error) {
      console.error('Failed to get account:', error);
      return null;
    }
  }

  async sendAsset(destination, asset, quantity, memo) {
    if (!this.connected) {
      throw new Error('Not connected to wallet');
    }

    try {
      const result = await this.provider.request({
        method: 'xcp_composeSend',
        params: [{
          destination,
          asset,
          quantity,
          memo
        }]
      });

      // Transaction was composed, signed, and broadcast
      console.log('Transaction broadcast:', result.broadcast?.txid);
      return result;
    } catch (error) {
      if (error.message.includes('User denied')) {
        console.log('User cancelled transaction');
      } else if (error.message.includes('timeout')) {
        console.log('Transaction timed out - user walked away');
      } else if (error.message.includes('Popup closed')) {
        console.log('User closed popup');
      } else {
        console.error('Transaction failed:', error);
      }
      throw error;
    }
  }

  async signMessage(message) {
    if (!this.connected) {
      throw new Error('Not connected to wallet');
    }

    try {
      const signature = await this.provider.request({
        method: 'xcp_signMessage',
        params: [message]
      });

      return signature;
    } catch (error) {
      console.error('Signing failed:', error);
      throw error;
    }
  }

  setupEventListeners() {
    this.provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.connected = false;
        this.account = null;
        console.log('Wallet locked or disconnected');
      } else {
        this.account = accounts[0];
        console.log('Account changed:', this.account);
      }
    });

    this.provider.on('disconnect', () => {
      this.connected = false;
      this.account = null;
      console.log('Disconnected from wallet');
    });
  }

  async disconnect() {
    try {
      await this.provider.request({
        method: 'xcp_disconnect',
        params: []
      });

      this.connected = false;
      this.account = null;
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  }
}

// Usage
async function main() {
  const client = new XCPWalletClient();

  try {
    await client.init();

    if (!client.connected) {
      const connected = await client.connect();
      if (!connected) {
        console.log('Connection rejected');
        return;
      }
    }

    console.log('Connected to:', client.account);

    // Send some XCP
    const tx = await client.sendAsset(
      '1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
      'XCP',
      100000000,
      'Test transaction'
    );

    console.log('Transaction sent:', tx.broadcast?.txid);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

## Best Practices

1. **Always check connection status** before making requests
2. **Handle all error cases** - users can cancel, timeout, or close popup
3. **Provide clear feedback** about what operation is being performed
4. **Use meaningful memos** to help users identify transactions
5. **Test edge cases** like popup closing and wallet locking
6. **Cache connection status** to avoid unnecessary prompts
7. **Listen for events** to react to account/connection changes

## Rate Limits

- Connection requests: 5 per minute
- Transaction requests: 10 per minute
- API queries: 30 per minute

## Support

- GitHub Issues: https://github.com/XCP/extension/issues
- Documentation: https://docs.counterparty.io
- Discord: [Join our community]

## Security Considerations

1. **Never request private keys** - the extension handles all signing
2. **Validate all user inputs** before passing to compose methods
3. **Use HTTPS** - the extension only works on secure contexts
4. **Handle errors gracefully** - don't expose sensitive information
5. **Respect user privacy** - only request necessary permissions

## Migration from Other Wallets

If migrating from MetaMask-style providers:
- Replace `eth_` methods with `xcp_` equivalents
- Update transaction builders to use compose methods
- Adjust for Bitcoin/Counterparty data structures
- Handle different error messages and codes

## Comparison with Ethereum EIP Standards

### Similarities with EIP-1193

1. **`request()` method pattern**: Both use the same RPC-style request interface:
   ```javascript
   provider.request({ method: string, params?: array | object })
   ```

2. **Event system**: Both implement similar events:
   - `accountsChanged`
   - `disconnect`
   - Event listener methods (`on`, `removeListener`)

3. **Error codes**: XCP uses the same error code standards:
   - `4001` - User rejected
   - `4100` - Unauthorized
   - `4200` - Unsupported method

### Key Differences

1. **Namespace**:
   - Ethereum: `window.ethereum` (EIP-1193) or `window.evmproviders` (EIP-5749)
   - XCP: `window.xcpwallet`

2. **Method prefixes**:
   - Ethereum: `eth_*` methods
   - XCP: `xcp_*` methods

3. **Transaction flow**:
   - **Ethereum**: Direct transaction signing (`eth_sendTransaction`)
   - **XCP**: Compose-first pattern with 23 specialized methods (`xcp_composeSend`, `xcp_composeOrder`, etc.) that open UI for review

4. **Missing Ethereum features**:
   - No `chainChanged` event (Bitcoin has no chain ID concept)
   - No `connect` event (uses connection methods instead)
   - No `message` event for subscriptions
   - No EIP-6963 multi-provider discovery

5. **XCP-specific features**:
   - **Compose methods**: Full suite of Counterparty operations (dispensers, dividends, assets, etc.)
   - **UI-first approach**: All transactions route through extension UI for transparency
   - **Recovery system**: Handles closed popups and locked wallets with recovery prompts
   - **Timeout handling**: 2-minute request timeout with grace periods

### Notable Implementation Choices

1. **Security-first design**: Deprecated `xcp_signTransaction` in favor of transparent compose methods
2. **User control**: All operations open extension UI for review/modification
3. **Bitcoin-specific**: Handles UTXOs, satoshi-based fees, and Counterparty protocol operations
4. **Single provider**: No multi-wallet discovery like EIP-5749/EIP-6963

### What's Missing from Ethereum Standards

- No provider info/metadata object (EIP-6963's `ProviderInfo`)
- No multi-provider support
- No chain/network switching capability
- No subscription/polling mechanisms
- No provider announcement events

The XCP implementation follows EIP-1193's core request/event patterns but adapts them for Bitcoin/Counterparty's unique requirements while prioritizing user transparency through mandatory UI interaction for all compose operations.