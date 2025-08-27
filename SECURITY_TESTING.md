# Security Testing Roadmap

This document tracks the security testing implementation for the XCP Wallet extension, focusing on fuzz testing critical areas that handle user input and sensitive data.

## ✅ Completed Security Tests

### 1. Asset Name Validation (`src/utils/validation/asset.ts`)
- **Status**: ✅ Complete
- **Test File**: `src/utils/validation/__tests__/asset.fuzz.test.ts`
- **Coverage**:
  - Validates asset naming rules (4-12 chars, A-Z only)
  - Numeric asset range validation (26^12 to 256^8 - 1)
  - Subasset format validation (PARENT.CHILD)
  - Reserved name rejection (BTC, XCP)
  - Injection attempt prevention
  - Unicode and control character handling
- **Findings**: All validation working correctly, no crashes on arbitrary input

### 2. Memo Validation (`src/utils/validation/memo.ts`)
- **Status**: ✅ Complete
- **Test File**: `src/utils/validation/__tests__/memo.fuzz.test.ts`
- **Coverage**:
  - Hex vs text detection
  - UTF-8 byte length calculation
  - Multi-byte character handling
  - Hex prefix normalization (0x handling)
  - Encoding/decoding round-trips
  - Length limit enforcement (80 bytes default)
- **Findings**: Properly handles all edge cases, UTF-8 encoding is accurate

## 🚧 In Progress

### 3. Component Updates
- **Status**: 🚧 In Progress
- **Task**: Update React components to use extracted validation utilities
- **Files to Update**:
  - `src/components/inputs/asset-name-input.tsx` (partially done)
  - Other components using validation logic

## 📋 Pending Security Tests

### 4. CSV Parser Security (`src/pages/compose/send/mpma/form.tsx`)
**Priority**: HIGH - Handles untrusted user input
- **Risks**:
  - CSV injection (formulas like =1+1)
  - Buffer overflow with large files
  - Malformed structure causing crashes
  - XSS via CSV content
- **Test Cases Needed**:
  - Mixed column counts
  - Various line endings (CRLF, LF, CR)
  - Quoted values with embedded commas
  - Unicode and null bytes
  - Extremely large files (memory exhaustion)
  - Files with thousands of columns

### 5. File Upload Security (`src/components/inputs/file-upload-input.tsx`)
**Priority**: HIGH - Processes binary data
- **Risks**:
  - Path traversal in filenames
  - MIME type spoofing
  - Memory exhaustion with large files
  - Malicious file content execution
- **Test Cases Needed**:
  - File size boundary testing
  - Malformed MIME types
  - Binary content patterns
  - Base64 encoding verification
  - Filename injection attempts

### 6. Encryption/Decryption (`src/utils/storage/secureStorage.ts`)
**Priority**: CRITICAL - Protects user secrets
- **Risks**:
  - Tampering detection bypass
  - Version downgrade attacks
  - Timing attacks
  - Weak randomness
- **Test Cases Needed**:
  - Data integrity verification
  - Password complexity handling
  - Salt/IV uniqueness
  - Authentication tag validation
  - Malformed encrypted data handling

### 7. Bitcoin Address Validation (`src/utils/blockchain/bitcoin.ts`)
**Priority**: CRITICAL - Prevents fund loss
- **Risks**:
  - Invalid address acceptance
  - Checksum bypass
  - Network confusion (mainnet/testnet)
- **Test Cases Needed**:
  - All address types (P2PKH, P2SH, P2WPKH, P2TR)
  - Bech32/Bech32m encoding
  - Case sensitivity handling
  - Length validation
  - Character set validation

### 8. Transaction Amount Validation
**Priority**: CRITICAL - Prevents fund loss
- **Risks**:
  - Integer overflow
  - Precision loss
  - Dust amount acceptance
  - MAX_INT boundary issues
- **Test Cases Needed**:
  - MAX_INT boundaries (2^63 - 1)
  - Floating point precision
  - Dust limit enforcement (546 sats)
  - Fee calculation overflow
  - Negative amounts

### 9. Private Key Handling (`src/utils/blockchain/bitcoin.ts`)
**Priority**: CRITICAL - Key material security
- **Risks**:
  - Key leakage in logs
  - Weak key generation
  - Format confusion (WIF/hex)
- **Test Cases Needed**:
  - WIF format validation
  - Hex format with/without 0x
  - Key derivation paths
  - Mnemonic to key conversion
  - Key normalization

### 10. URL/URI Parsing
**Priority**: MEDIUM - External data handling
- **Risks**:
  - SSRF attacks
  - Protocol confusion
  - Parameter injection
- **Test Cases Needed**:
  - Bitcoin URI parsing
  - Counterparty API URLs
  - WebSocket connection strings

## Testing Methodology

### Property-Based Testing with fast-check
```javascript
fc.assert(
  fc.property(
    fc.string(),  // Random input
    (input) => {
      // Should never crash
      expect(() => validate(input)).not.toThrow();
      // Should return expected structure
      const result = validate(input);
      expect(result).toHaveProperty('isValid');
    }
  ),
  { numRuns: 1000 }  // Run 1000 random tests
);
```

### Security Test Patterns
1. **Injection Prevention**: Test with XSS, SQL, command injection payloads
2. **Boundary Testing**: Test limits, overflows, underflows
3. **Encoding Issues**: Test Unicode, null bytes, control characters
4. **Resource Exhaustion**: Test with large inputs, deep recursion
5. **Type Confusion**: Test with unexpected types, formats
6. **Consistency**: Verify same input always gives same output

## Implementation Guidelines

### Extracting Testable Code
1. Create pure functions in `src/utils/validation/`
2. No dependencies on React, browser APIs, or contexts
3. Export validation logic separately from UI components
4. Components delegate to utility functions

### Writing Effective Fuzz Tests
1. Test the real code, not mocks
2. Generate truly random inputs
3. Test edge cases explicitly
4. Verify error messages are helpful
5. Check performance with large inputs
6. Ensure no crashes on any input

## Success Metrics

- [ ] All critical user input validated with fuzz tests
- [ ] Zero crashes on arbitrary input
- [ ] All injection attempts properly sanitized
- [ ] Performance acceptable even with adversarial input
- [ ] Clear error messages for invalid input
- [ ] Security findings documented and fixed

## Next Steps

1. Complete CSV parser fuzz testing (HIGH priority)
2. Implement file upload security tests
3. Test encryption layer thoroughly
4. Validate all Bitcoin operations
5. Create integration tests for complete workflows
6. Document all security findings
7. Run tests in CI/CD pipeline

## Notes

- Each security test area is quite involved and requires careful implementation
- Focus on testing real code, not mocks
- Prioritize areas handling user funds and secrets
- Consider hiring security auditors for critical areas
- Keep this document updated as tests are implemented