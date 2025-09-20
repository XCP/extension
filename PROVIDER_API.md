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
    destination: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
    asset: 'XCP',
    quantity: 100000000, // In satoshis for BTC, base units for others
    memo: 'Payment for services', // Optional
    memo_is_hex: false // Optional
  }]
});
```

### xcp_composeOrder

Create a DEX order.

```javascript
const result = await provider.request({
  method: 'xcp_composeOrder',
  params: [{
    give_asset: 'XCP',
    give_quantity: 100000000,
    get_asset: 'PEPECASH',
    get_quantity: 1000,
    expiration: 1000 // Blocks until expiration
  }]
});
```

### xcp_composeDispenser

Create a token dispenser.

```javascript
const result = await provider.request({
  method: 'xcp_composeDispenser',
  params: [{
    asset: 'MYTOKEN',
    give_quantity: 100, // Amount per dispense
    escrow_quantity: 10000, // Total to escrow
    mainchainrate: 100000, // Satoshis per token
    status: 0 // 0=open, 10=closed
  }]
});
```

### xcp_composeDispense

Dispense from a dispenser.

```javascript
const result = await provider.request({
  method: 'xcp_composeDispense',
  params: [{
    dispenser: '1DispenserAddressXXXXXXXXXXXXX',
    quantity: 100
  }]
});
```

### xcp_composeDividend

Distribute dividends to token holders.

```javascript
const result = await provider.request({
  method: 'xcp_composeDividend',
  params: [{
    asset: 'MYTOKEN', // Token whose holders receive dividend
    dividend_asset: 'XCP', // What to distribute
    quantity_per_unit: 1000 // Per base unit of asset
  }]
});
```

### xcp_composeIssuance

Issue a new asset.

```javascript
const result = await provider.request({
  method: 'xcp_composeIssuance',
  params: [{
    asset: 'MYTOKEN',
    quantity: 1000000,
    divisible: true,
    lock: false,
    description: 'My awesome token'
  }]
});
```

### xcp_composeSweep

Sweep all assets from an address.

```javascript
const result = await provider.request({
  method: 'xcp_composeSweep',
  params: [{
    destination: '1DestinationAddressXXXXXXXXXX',
    flags: 1, // Sweep flags
    memo: 'Consolidating funds'
  }]
});
```

### xcp_composeBroadcast

Broadcast a message to the network.

```javascript
const result = await provider.request({
  method: 'xcp_composeBroadcast',
  params: [{
    text: 'MYTOKEN is now trading!',
    value: '0',
    fee_fraction: '0',
    timestamp: Math.floor(Date.now() / 1000)
  }]
});
```

### Other Compose Methods

- `xcp_composeBTCPay` - Pay for a BTC order match
- `xcp_composeCancel` - Cancel an open order
- `xcp_composeDestroy` - Destroy supply of an asset
- `xcp_composeBet` - Create a bet (binary option)
- `xcp_composeFairminter` - Create a fairminter
- `xcp_composeFairmint` - Mint from a fairminter
- `xcp_composeAttach` - Attach assets to UTXO
- `xcp_composeDetach` - Detach assets from UTXO
- `xcp_composeMoveUTXO` - Move UTXO to new address
- `xcp_composeIssueSupply` - Issue additional supply
- `xcp_composeLockSupply` - Lock asset supply
- `xcp_composeResetSupply` - Reset asset supply
- `xcp_composeTransfer` - Transfer asset ownership
- `xcp_composeUpdateDescription` - Update asset description
- `xcp_composeLockDescription` - Lock asset description

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