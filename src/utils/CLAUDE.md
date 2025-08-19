# Utils Directory

This directory contains utility functions and core subsystems for the XCP Wallet extension.

## Directory Structure

```
utils/
├── blockchain/           # Bitcoin and Counterparty blockchain operations
│   ├── bitcoin/         # Bitcoin-specific utilities
│   ├── counterparty/    # Counterparty API and operations
│   └── ...             # Transaction, address, UTXO utilities
├── encryption/          # Cryptographic operations
├── storage/            # Browser storage management
├── format.ts           # Formatting and display utilities
├── numeric.ts          # Number handling and validation
└── fathom.ts          # Analytics integration
```

## Subsystems

### Blockchain Utilities (`/blockchain`)

#### Core Modules

**bitcoin.ts**
- Address generation and validation
- Key derivation (BIP32/BIP39)
- Transaction creation and signing
- UTXO management
- Fee calculation

**counterparty/api.ts**
- 40+ API endpoints for Counterparty protocol
- Token operations (send, issue, destroy)
- DEX operations (orders, matches)
- Dispenser and betting operations
- Comprehensive error handling

**Key Functions**:
```typescript
// Address generation
generateAddress(mnemonic: string, addressType: AddressType, index: number): AddressInfo

// Transaction signing
signTransaction(psbt: bitcoin.Psbt, wallet: Wallet, address: Address): string

// UTXO fetching
getUtxos(address: string): Promise<UTXO[]>

// Counterparty operations
counterparty.createSend(params: SendParams): Promise<Transaction>
counterparty.createOrder(params: OrderParams): Promise<Transaction>
```

#### Address Types Support
- **P2PKH**: Legacy addresses (1...)
- **P2WPKH**: Native SegWit (bc1q...)
- **P2SH-P2WPKH**: Nested SegWit (3...)
- **P2TR**: Taproot (bc1p...)
- **Counterwallet**: Special derivation for compatibility

### Encryption Utilities (`/encryption`)

#### Security Architecture
```typescript
// Encryption flow
Password -> PBKDF2 (420,690 iterations) -> AES-GCM -> Encrypted payload

// Decryption flow
Encrypted payload + Password -> PBKDF2 -> AES-GCM -> Original data
```

**Key Functions**:
```typescript
// Mnemonic encryption
encryptMnemonic(mnemonic: string, password: string): Promise<EncryptedMnemonic>
decryptMnemonic(encrypted: EncryptedMnemonic, password: string): Promise<string>

// Private key encryption
encryptPrivateKey(privateKey: string, password: string): Promise<EncryptedPrivateKey>
decryptPrivateKey(encrypted: EncryptedPrivateKey, password: string): Promise<string>

// Password operations
hashPassword(password: string): Promise<string>
verifyPassword(password: string, hash: string): Promise<boolean>
```

#### Security Features
- Version control in encrypted payloads
- Authentication tags to prevent tampering
- Salt generation for each encryption
- Secure random number generation
- Memory-safe operations

### Storage Utilities (`/storage`)

#### Storage Patterns
```typescript
// Generic storage interface
interface StorageItem {
  id: string;
  [key: string]: any;
}

// Storage operations
class Storage<T extends StorageItem> {
  async getAll(): Promise<T[]>
  async get(id: string): Promise<T | null>
  async save(item: T): Promise<void>
  async remove(id: string): Promise<void>
  async clear(): Promise<void>
}
```

#### Specialized Storage

**WalletStorage**
- Encrypted wallet persistence
- Wallet metadata management
- Migration support

**SettingsStorage**
- User preferences
- App configuration
- Default values handling

**SessionStorage**
- Temporary unlocked secrets
- Auto-clear on lock
- Memory-only for sensitive data

#### Storage Best Practices
```typescript
// Always use typed storage
const walletStorage = new Storage<Wallet>('wallets');

// Deep clone on read
const items = structuredClone(await storage.getAll());

// Atomic operations
await chrome.storage.local.set({ [key]: value });

// Error handling
try {
  await storage.save(item);
} catch (error) {
  console.error('Storage error:', error);
  // Fallback logic
}
```

### Format Utilities (`format.ts`)

**Common Functions**:
```typescript
// Class name utilities
cn(...classes: ClassValue[]): string

// Bitcoin formatting
formatBitcoin(satoshis: number): string
formatAddress(address: string, length?: number): string

// Number formatting
formatNumber(value: number, decimals?: number): string
formatPercentage(value: number): string

// Date formatting
formatDate(date: Date): string
formatTimestamp(timestamp: number): string
```

### Numeric Utilities (`numeric.ts`)

**Validation Functions**:
```typescript
// Input validation
isValidAmount(value: string): boolean
isValidInteger(value: string): boolean
isValidDecimal(value: string, decimals: number): boolean

// Conversion
satoshisToBitcoin(satoshis: number): number
bitcoinToSatoshis(bitcoin: number): number

// Calculation
calculateFee(inputs: number, outputs: number, feeRate: number): number
```

### Analytics (`fathom.ts`)

**Privacy-First Tracking**:
```typescript
// Initialize with consent
initFathom(siteId: string, consent: boolean)

// Track events
trackEvent(eventName: string, value?: number)

// Path sanitization
sanitizePath(path: string): string // Removes sensitive data

// User consent management
setConsent(consent: boolean): void
```

## Utility Patterns

### Pure Functions
All utilities should be pure functions when possible:
```typescript
// Good - pure function
export function formatAddress(address: string, maxLength = 10): string {
  if (address.length <= maxLength) return address;
  const start = address.slice(0, 6);
  const end = address.slice(-4);
  return `${start}...${end}`;
}

// Avoid - side effects
export function formatAndLog(address: string): string {
  console.log(address); // Side effect!
  return formatAddress(address);
}
```

### Error Handling
```typescript
// Throw for programmer errors
export function validateAddress(address: string): void {
  if (!address) {
    throw new Error('Address is required');
  }
  // validation logic
}

// Return null/undefined for expected failures
export async function fetchData(url: string): Promise<Data | null> {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch {
    return null; // Expected network failure
  }
}
```

### Type Safety
```typescript
// Use discriminated unions
type Result<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

// Use type guards
function isValidWallet(obj: unknown): obj is Wallet {
  return typeof obj === 'object' && 
         obj !== null &&
         'id' in obj &&
         'type' in obj;
}
```

## Testing Requirements

### Unit Tests Location
Each utility should have tests in adjacent `__tests__` directory:
```
utils/
├── format.ts
├── __tests__/
│   └── format.test.ts
```

### Test Patterns
```typescript
describe('formatAddress', () => {
  it('should truncate long addresses', () => {
    const address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    expect(formatAddress(address, 10)).toBe('bc1qar...5mdq');
  });
  
  it('should not truncate short addresses', () => {
    const address = 'short';
    expect(formatAddress(address, 10)).toBe('short');
  });
});
```

## Performance Considerations

### Memoization
```typescript
// Memoize expensive computations
const memoizedExpensiveOp = memoize(expensiveOperation);

// Use for repeated calls with same inputs
const result1 = memoizedExpensiveOp(input); // Computed
const result2 = memoizedExpensiveOp(input); // Cached
```

### Async Operations
```typescript
// Batch API calls
const results = await Promise.all([
  fetchBalance(address1),
  fetchBalance(address2),
  fetchBalance(address3),
]);

// Use debouncing for user input
const debouncedSearch = debounce(search, 300);
```

## Common Imports

```typescript
// Crypto libraries
import * as bitcoin from '@scure/btc-signer';
import { HDKey } from '@scure/bip32';
import { generateMnemonic } from '@scure/bip39';

// Utilities
import { sha256 } from '@noble/hashes/sha256';
import { hex } from '@scure/base';

// Types
import type { Wallet, Address, Transaction } from '@/types';
```

## Anti-Patterns to Avoid

1. **Don't mutate inputs** - Always return new values
2. **Don't use `any` type** - Use proper TypeScript types
3. **Don't ignore errors** - Handle or propagate appropriately
4. **Don't use synchronous storage** - Always use async APIs
5. **Don't hardcode values** - Use constants and configuration
6. **Don't mix concerns** - Keep utilities focused
7. **Don't skip validation** - Validate inputs thoroughly

## Security Checklist

- [ ] Never log sensitive data (private keys, mnemonics)
- [ ] Always validate user inputs
- [ ] Use crypto.getRandomValues() for randomness
- [ ] Clear sensitive data from memory when done
- [ ] Validate addresses before transactions
- [ ] Use constant-time comparison for secrets
- [ ] Sanitize data before storage
- [ ] Implement rate limiting for API calls