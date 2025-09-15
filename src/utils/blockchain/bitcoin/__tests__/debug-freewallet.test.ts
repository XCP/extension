/**
 * Debug FreeWallet signature verification
 * Systematically test all verification methods
 */

import { describe, it, expect } from 'vitest';
import { verifyMessage, verifyMessageWithMethod, verifyMessageWithLooseBIP137 } from '../messageVerifier';
import { verifyBIP322Signature, verifySimpleBIP322 } from '../bip322';
import { sha256 } from '@noble/hashes/sha2';
import { base64, hex } from '@scure/base';
import * as secp256k1 from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';

describe('Debug FreeWallet Signature', () => {
  const address = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
  const message = 'test';
  const signature = 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=';

  it('should analyze signature structure', async () => {
    console.log('=== SIGNATURE ANALYSIS ===\n');

    // Decode signature
    const sigBytes = base64.decode(signature);
    console.log('Signature bytes:', hex.encode(sigBytes));
    console.log('Length:', sigBytes.length, 'bytes');

    if (sigBytes.length === 65) {
      const flag = sigBytes[0];
      const r = sigBytes.slice(1, 33);
      const s = sigBytes.slice(33, 65);

      console.log('\nComponents:');
      console.log('  Flag:', flag);
      console.log('  r:', hex.encode(r));
      console.log('  s:', hex.encode(s));

      // Interpret flag
      if (flag >= 27 && flag <= 30) {
        console.log('  Type: P2PKH uncompressed (Legacy)');
        console.log('  Recovery ID:', flag - 27);
      } else if (flag >= 31 && flag <= 34) {
        console.log('  Type: P2PKH compressed');
        console.log('  Recovery ID:', flag - 31);
      } else if (flag >= 35 && flag <= 38) {
        console.log('  Type: P2SH-P2WPKH');
        console.log('  Recovery ID:', flag - 35);
      } else if (flag >= 39 && flag <= 42) {
        console.log('  Type: P2WPKH');
        console.log('  Recovery ID:', flag - 39);
      }
    }

    // Check address type
    console.log('\nAddress analysis:');
    console.log('  Address:', address);
    console.log('  Type: P2PKH (starts with 1)');
  });

  it('should test all verification methods', async () => {
    console.log('\n=== VERIFICATION ATTEMPTS ===\n');

    // 1. BIP-322
    console.log('1. BIP-322 Verification:');
    try {
      const bip322Result = await verifyBIP322Signature(message, signature, address);
      console.log('   Full BIP-322:', bip322Result ? '✅ PASSED' : '❌ FAILED');
    } catch (e) {
      console.log('   Full BIP-322: ❌ ERROR:', e.message);
    }

    try {
      const simpleBip322 = await verifySimpleBIP322(message, signature, address);
      console.log('   Simple BIP-322:', simpleBip322 ? '✅ PASSED' : '❌ FAILED');
    } catch (e) {
      console.log('   Simple BIP-322: ❌ ERROR:', e.message);
    }

    // 2. BIP-137 (Strict)
    console.log('\n2. BIP-137 Strict:');
    const strict137 = await verifyMessageWithLooseBIP137(message, signature, address, false);
    console.log('   Result:', strict137 ? '✅ PASSED' : '❌ FAILED');

    // 3. BIP-137 (Loose)
    console.log('\n3. BIP-137 Loose:');
    const loose137 = await verifyMessageWithLooseBIP137(message, signature, address, true);
    console.log('   Result:', loose137 ? '✅ PASSED' : '❌ FAILED');

    // 4. Main verifyMessage (tries all methods)
    console.log('\n4. Main verifyMessage:');
    const mainResult = await verifyMessage(message, signature, address);
    const methodResult = await verifyMessageWithMethod(message, signature, address);
    console.log('   Result:', mainResult ? '✅ PASSED' : '❌ FAILED');
    console.log('   Method:', methodResult.method || 'None');
  });

  it('should test different message formats', async () => {
    console.log('\n=== MESSAGE FORMAT TESTS ===\n');

    // Different message prefixes that wallets might use
    const prefixes = [
      { name: 'Bitcoin Signed Message', prefix: '\x18Bitcoin Signed Message:\n' },
      { name: 'Standard (length prefix)', prefix: '' }, // Will be handled by formatMessageForSigning
      { name: 'No prefix', prefix: null }
    ];

    for (const { name, prefix } of prefixes) {
      console.log(`Testing with ${name}:`);

      // Try to manually verify with different message formats
      const sigBytes = base64.decode(signature);
      const flag = sigBytes[0];

      let messageBytes: Uint8Array;
      if (prefix === null) {
        // No prefix at all
        messageBytes = new TextEncoder().encode(message);
      } else if (prefix === '') {
        // Standard formatting (what formatMessageForSigning does)
        const messageUtf8 = new TextEncoder().encode(message);
        const varintBuf = new Uint8Array(9);
        const varintLen = btc.CompactSize.encode(messageUtf8.length, varintBuf);

        const prefixBytes = new TextEncoder().encode('\x18Bitcoin Signed Message:\n');
        const formatted = new Uint8Array(prefixBytes.length + varintLen + messageUtf8.length);
        formatted.set(prefixBytes);
        formatted.set(varintBuf.slice(0, varintLen), prefixBytes.length);
        formatted.set(messageUtf8, prefixBytes.length + varintLen);
        messageBytes = formatted;
      } else {
        // Custom prefix
        const prefixBytes = new TextEncoder().encode(prefix);
        const messageUtf8 = new TextEncoder().encode(message);
        messageBytes = new Uint8Array(prefixBytes.length + messageUtf8.length);
        messageBytes.set(prefixBytes);
        messageBytes.set(messageUtf8, prefixBytes.length);
      }

      // Double SHA256
      const messageHash = sha256(sha256(messageBytes));

      // Try to recover public key
      try {
        const recoveryId = (flag >= 31 && flag <= 34) ? flag - 31 : flag - 27;
        const compressed = flag >= 31;

        const r = sigBytes.slice(1, 33);
        const s = sigBytes.slice(33, 65);

        const sig = new secp256k1.Signature(
          BigInt('0x' + hex.encode(r)),
          BigInt('0x' + hex.encode(s))
        );

        const sigWithRecovery = sig.addRecoveryBit(recoveryId);
        const publicKey = sigWithRecovery.recoverPublicKey(messageHash);
        const pubKeyBytes = publicKey.toRawBytes(compressed);

        // Derive P2PKH address
        const derivedAddress = btc.p2pkh(pubKeyBytes).address;

        console.log(`  Recovered address: ${derivedAddress}`);
        console.log(`  Matches: ${derivedAddress === address ? '✅ YES' : '❌ NO'}`);
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  });

  it('should test platform-specific verification', async () => {
    console.log('\n=== PLATFORM-SPECIFIC TESTS ===\n');

    // Test as if signature came from different wallets
    const platforms = [
      'Bitcoin Core',
      'Bitcore',
      'FreeWallet',
      'Sparrow',
      'Ledger',
      'Electrum'
    ];

    console.log('Testing signature as if from different platforms:');
    console.log('(Note: This is the same signature, testing different verification approaches)\n');

    for (const platform of platforms) {
      console.log(`${platform}:`);

      // Each platform might use slightly different approaches
      if (platform === 'Bitcore' || platform === 'FreeWallet') {
        // These typically use BIP-137/Legacy
        const result = await verifyMessageWithLooseBIP137(message, signature, address, true);
        console.log(`  BIP-137 Loose: ${result ? '✅' : '❌'}`);
      } else if (platform === 'Bitcoin Core') {
        // Strict BIP-137
        const result = await verifyMessageWithLooseBIP137(message, signature, address, false);
        console.log(`  BIP-137 Strict: ${result ? '✅' : '❌'}`);
      } else if (platform === 'Electrum') {
        // Electrum uses standard BIP-137
        const result = await verifyMessage(message, signature, address);
        console.log(`  Standard: ${result ? '✅' : '❌'}`);
      } else {
        // Try all methods
        const result = await verifyMessage(message, signature, address);
        console.log(`  All methods: ${result ? '✅' : '❌'}`);
      }
    }
  });

  it('should manually implement legacy verification', async () => {
    console.log('\n=== MANUAL LEGACY VERIFICATION ===\n');

    // Manually implement the legacy verification to debug
    const sigBytes = base64.decode(signature);
    const flag = sigBytes[0];

    console.log('Flag:', flag);
    console.log('Flag interpretation:');
    if (flag === 31) console.log('  P2PKH compressed, recovery ID 0');
    if (flag === 32) console.log('  P2PKH compressed, recovery ID 1');

    // Format message the standard way
    const messageUtf8 = new TextEncoder().encode(message);
    const varintBuf = new Uint8Array(9);
    const varintLen = btc.CompactSize.encode(messageUtf8.length, varintBuf);

    const prefixBytes = new TextEncoder().encode('\x18Bitcoin Signed Message:\n');
    const formatted = new Uint8Array(prefixBytes.length + varintLen + messageUtf8.length);
    formatted.set(prefixBytes);
    formatted.set(varintBuf.slice(0, varintLen), prefixBytes.length);
    formatted.set(messageUtf8, prefixBytes.length + varintLen);

    console.log('\nFormatted message (hex):', hex.encode(formatted));
    console.log('Formatted message (bytes):', formatted);

    // Double SHA256
    const messageHash = sha256(sha256(formatted));
    console.log('Message hash:', hex.encode(messageHash));

    // Try recovery
    const recoveryId = flag - 31; // Assuming compressed P2PKH
    const r = sigBytes.slice(1, 33);
    const s = sigBytes.slice(33, 65);

    console.log('\nSignature components:');
    console.log('  r:', hex.encode(r));
    console.log('  s:', hex.encode(s));
    console.log('  Recovery ID:', recoveryId);

    try {
      const sig = new secp256k1.Signature(
        BigInt('0x' + hex.encode(r)),
        BigInt('0x' + hex.encode(s))
      );

      const sigWithRecovery = sig.addRecoveryBit(recoveryId);
      const publicKey = sigWithRecovery.recoverPublicKey(messageHash);
      const pubKeyBytes = publicKey.toRawBytes(true); // compressed

      console.log('\nRecovered public key:', hex.encode(pubKeyBytes));

      // Derive P2PKH address
      const derivedAddress = btc.p2pkh(pubKeyBytes).address;

      console.log('Derived address:', derivedAddress);
      console.log('Expected address:', address);
      console.log('Match:', derivedAddress === address ? '✅ SUCCESS!' : '❌ FAILED');

      // Also try uncompressed
      const pubKeyUncompressed = publicKey.toRawBytes(false);
      const derivedUncompressed = btc.p2pkh(pubKeyUncompressed).address;
      console.log('\nWith uncompressed key:');
      console.log('Derived address:', derivedUncompressed);
      console.log('Match:', derivedUncompressed === address ? '✅ SUCCESS!' : '❌ FAILED');

    } catch (e) {
      console.log('Error during recovery:', e.message);
    }
  });
});