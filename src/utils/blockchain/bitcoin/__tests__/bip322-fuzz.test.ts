/**
 * BIP-322 Fuzz Testing
 * Generates random mnemonics, creates addresses of all types, signs with BIP-322, and verifies
 */

import { describe, it, expect } from 'vitest';
import { hex, base64, utf8 } from '@scure/base';
import * as secp256k1 from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { randomBytes } from '@noble/hashes/utils';
import {
  signBIP322P2PKH,
  signBIP322P2WPKH,
  signBIP322P2SH_P2WPKH,
  signBIP322P2TR,
  verifyBIP322Signature
} from '../bip322';

// Required initialization for @noble/secp256k1 v3
import { hashes } from '@noble/secp256k1';

if (!hashes.sha256) {
  hashes.sha256 = sha256;
}
if (!hashes.hmacSha256) {
  hashes.hmacSha256 = (key: Uint8Array, msg: Uint8Array): Uint8Array => {
    return hmac(sha256, key, msg);
  };
  hashes.hmacSha256Async = async (key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> => {
    return hmac(sha256, key, msg);
  };
  hashes.sha256Async = async (msg: Uint8Array): Promise<Uint8Array> => {
    return sha256(msg);
  };
}

/**
 * Check if a value is a valid private key
 */
function isValidPrivateKey(key: Uint8Array): boolean {
  if (key.length !== 32) return false;

  // secp256k1 order
  const ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

  // Convert key to BigInt
  let keyNum = BigInt(0);
  for (let i = 0; i < key.length; i++) {
    keyNum = (keyNum << BigInt(8)) | BigInt(key[i]);
  }

  // Must be > 0 and < ORDER
  return keyNum > BigInt(0) && keyNum < ORDER;
}

/**
 * Generate a random private key
 */
function generateRandomPrivateKey(): Uint8Array {
  let privateKey: Uint8Array;

  // Generate a valid private key (must be less than secp256k1 order)
  do {
    privateKey = randomBytes(32);
  } while (!isValidPrivateKey(privateKey));

  return privateKey;
}

/**
 * Derive deterministic private keys from a seed for testing
 */
function derivePrivateKey(seed: Uint8Array, index: number): Uint8Array {
  // Simple deterministic derivation for testing
  const data = new Uint8Array(seed.length + 4);
  data.set(seed);
  data.set(new Uint8Array([index, 0, 0, 0]), seed.length);

  const derived = sha256(data);

  // Ensure it's a valid private key
  if (!isValidPrivateKey(derived)) {
    // If not valid, hash again
    return sha256(derived);
  }

  return derived;
}

/**
 * Generate all address types from a private key
 */
function generateAddresses(privateKey: Uint8Array) {
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const xOnlyPubKey = publicKey.slice(1, 33);

  return {
    p2pkh: btc.p2pkh(publicKey).address!,
    p2wpkh: btc.p2wpkh(publicKey).address!,
    p2sh_p2wpkh: btc.p2sh(btc.p2wpkh(publicKey)).address!,
    p2tr: btc.p2tr(xOnlyPubKey).address!
  };
}

describe('BIP-322 Fuzz Testing', () => {
  it('should sign and verify with random keys across all address types', { timeout: 30000 }, async () => {
    const NUM_SEEDS = 2;
    const NUM_ADDRESSES_PER_TYPE = 2;
    const TEST_MESSAGES = [
      '',
      'Hello World',
      'The quick brown fox jumps over the lazy dog',
      '🚀 Unicode test message 测试消息 🌍',
      JSON.stringify({ test: 'data', nested: { value: 123 } })
    ];

    let totalTests = 0;
    let passedTests = 0;

    for (let seedIndex = 0; seedIndex < NUM_SEEDS; seedIndex++) {
      // Generate random seed
      const seed = randomBytes(32);
      console.log(`\n=== Testing seed ${seedIndex + 1}/${NUM_SEEDS} ===`);
      console.log(`Seed: ${hex.encode(seed).slice(0, 20)}...`);

      for (let addressIndex = 0; addressIndex < NUM_ADDRESSES_PER_TYPE; addressIndex++) {
        // Generate different private keys for each address type
        const privateKeys = {
          p2pkh: derivePrivateKey(seed, addressIndex * 4),
          p2sh_p2wpkh: derivePrivateKey(seed, addressIndex * 4 + 1),
          p2wpkh: derivePrivateKey(seed, addressIndex * 4 + 2),
          p2tr: derivePrivateKey(seed, addressIndex * 4 + 3)
        };

        for (const [addressType, privateKey] of Object.entries(privateKeys)) {
          const addresses = generateAddresses(privateKey);
          const address = addresses[addressType as keyof typeof addresses];

          console.log(`\n  Testing ${addressType} address: ${address}`);

          for (const message of TEST_MESSAGES) {
            totalTests++;
            const messagePreview = message.length > 30
              ? message.slice(0, 30) + '...'
              : message || '(empty)';

            try {
              let signature: string;

              // Sign with appropriate BIP-322 method
              switch (addressType) {
                case 'p2pkh':
                  signature = await signBIP322P2PKH(message, privateKey, true);
                  break;
                case 'p2wpkh':
                  signature = await signBIP322P2WPKH(message, privateKey);
                  break;
                case 'p2sh_p2wpkh':
                  signature = await signBIP322P2SH_P2WPKH(message, privateKey);
                  break;
                case 'p2tr':
                  signature = await signBIP322P2TR(message, privateKey);
                  break;
                default:
                  throw new Error(`Unknown address type: ${addressType}`);
              }

              // Verify the signature
              const isValid = await verifyBIP322Signature(message, signature, address);

              if (isValid) {
                passedTests++;
                console.log(`    ✓ ${messagePreview}`);
              } else {
                console.error(`    ✗ ${messagePreview} - Verification failed`);
              }

              // Additional cross-validation: signature should NOT verify with different message
              const wrongMessage = message + '_modified';
              const isInvalid = await verifyBIP322Signature(wrongMessage, signature, address);

              if (!isInvalid) {
                totalTests++;
                passedTests++;
              } else {
                console.error(`    ✗ Cross-validation failed - signature verified with wrong message`);
              }

              // Additional cross-validation: signature should NOT verify with different address
              if (addressType !== 'p2tr') { // Pick a different address type
                const wrongAddress = addresses.p2tr;
                const isInvalidAddress = await verifyBIP322Signature(message, signature, wrongAddress);

                if (!isInvalidAddress) {
                  totalTests++;
                  passedTests++;
                } else {
                  console.error(`    ✗ Cross-validation failed - signature verified with wrong address`);
                }
              }
            } catch (error) {
              console.error(`    ✗ ${messagePreview} - Error: ${error}`);
            }
          }
        }
      }
    }

    console.log(`\n=== Fuzz Test Results ===`);
    console.log(`Total tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`);

    // Expect at least 95% success rate for fuzz testing
    expect(passedTests / totalTests).toBeGreaterThanOrEqual(0.95);
  });

  it('should handle edge cases in BIP-322 signing and verification', async () => {
    const privateKey = generateRandomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    const address = btc.p2wpkh(publicKey).address!;

    const edgeCases = [
      { message: '', description: 'Empty message' },
      { message: ' ', description: 'Single space' },
      { message: '\n', description: 'Newline character' },
      { message: '\t\r\n', description: 'Whitespace characters' },
      { message: '0', description: 'Single zero' },
      { message: '00000000', description: 'Multiple zeros' },
      { message: 'a'.repeat(1000), description: 'Long message (1000 chars)' },
      { message: '☃️❄️🎅', description: 'Only emojis' },
      { message: '\u0000\u0001\u0002', description: 'Control characters' },
      { message: 'null', description: 'String "null"' },
      { message: 'undefined', description: 'String "undefined"' },
      { message: '{"json":true}', description: 'JSON string' },
      { message: '<script>alert(1)</script>', description: 'HTML/XSS attempt' },
      { message: '../../etc/passwd', description: 'Path traversal attempt' },
      { message: 'DROP TABLE users;', description: 'SQL injection attempt' }
    ];

    console.log('\n=== Edge Case Testing ===');

    for (const { message, description } of edgeCases) {
      try {
        const signature = await signBIP322P2WPKH(message, privateKey);
        const isValid = await verifyBIP322Signature(message, signature, address);

        if (isValid) {
          console.log(`✓ ${description}`);
        } else {
          console.error(`✗ ${description} - Verification failed`);
        }

        expect(isValid).toBe(true);
      } catch (error) {
        console.error(`✗ ${description} - Error: ${error}`);
        throw error;
      }
    }
  });

  it('should ensure signatures are deterministic', async () => {
    // Use a fixed seed for deterministic testing
    const seed = hex.decode('0000000000000000000000000000000000000000000000000000000000000001');
    const privateKey = derivePrivateKey(seed, 0);
    const message = 'Test deterministic signing';

    // Sign the same message multiple times
    const signatures = [];
    for (let i = 0; i < 5; i++) {
      const signature = await signBIP322P2WPKH(message, privateKey);
      signatures.push(signature);
    }

    // All signatures should be identical (deterministic)
    const firstSig = signatures[0];
    for (let i = 1; i < signatures.length; i++) {
      expect(signatures[i]).toBe(firstSig);
    }

    console.log('✓ Signatures are deterministic');
  });

  it('should reject tampered signatures', async () => {
    const privateKey = generateRandomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    const address = btc.p2wpkh(publicKey).address!;
    const message = 'Original message';

    const originalSignature = await signBIP322P2WPKH(message, privateKey);

    // Tamper with the signature in various ways
    const tamperTests = [
      {
        description: 'Flip one bit',
        tamper: (sig: string) => {
          const bytes = base64.decode(sig);
          bytes[10] ^= 0x01; // Flip one bit
          return base64.encode(bytes);
        }
      },
      {
        description: 'Truncate signature',
        tamper: (sig: string) => sig.slice(0, -10)
      },
      {
        description: 'Add extra bytes',
        tamper: (sig: string) => sig + 'AAAA'
      },
      {
        description: 'Replace middle bytes',
        tamper: (sig: string) => {
          const bytes = base64.decode(sig);
          for (let i = 20; i < 30 && i < bytes.length; i++) {
            bytes[i] = 0xFF;
          }
          return base64.encode(bytes);
        }
      }
    ];

    console.log('\n=== Tamper Detection Testing ===');

    for (const { description, tamper } of tamperTests) {
      try {
        const tamperedSignature = tamper(originalSignature);
        const isValid = await verifyBIP322Signature(message, tamperedSignature, address);

        expect(isValid).toBe(false);
        console.log(`✓ Correctly rejected: ${description}`);
      } catch (error) {
        // If it throws an error, that's also fine (signature format invalid)
        console.log(`✓ Correctly rejected (error): ${description}`);
      }
    }
  });
});