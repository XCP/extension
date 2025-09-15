/**
 * Test FreeWallet signature verification
 */

import { describe, it, expect } from 'vitest';
import { verifyMessage, verifyMessageWithMethod, verifyMessageWithLooseBIP137 } from '../messageVerifier';

describe('FreeWallet Signature Verification', () => {
  it('should verify FreeWallet signature', async () => {
    // Real signature from FreeWallet
    const address = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
    const message = 'test';
    const signature = 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=';

    console.log('FreeWallet Signature Test:');
    console.log(`  Address: ${address}`);
    console.log(`  Message: "${message}"`);
    console.log(`  Signature: ${signature}`);

    // Try main verifyMessage
    const mainResult = await verifyMessage(message, signature, address);
    const methodResult = await verifyMessageWithMethod(message, signature, address);

    console.log(`\n  Main verifyMessage: ${mainResult ? '✅ VERIFIED' : '❌ FAILED'}`);
    console.log(`  Method: ${methodResult.method || 'None'}`);

    // Try strict BIP-137
    const strictResult = await verifyMessageWithLooseBIP137(
      message,
      signature,
      address,
      false // Strict
    );

    console.log(`  Strict BIP-137: ${strictResult ? '✅ VERIFIED' : '❌ FAILED'}`);

    // Try loose BIP-137
    const looseResult = await verifyMessageWithLooseBIP137(
      message,
      signature,
      address,
      true // Loose
    );

    console.log(`  Loose BIP-137: ${looseResult ? '✅ VERIFIED' : '❌ FAILED'}`);

    // Decode signature to check flag
    const { base64 } = await import('@scure/base');
    const sigBytes = base64.decode(signature);
    const flag = sigBytes[0];

    console.log(`\n  Signature details:`);
    console.log(`    Length: ${sigBytes.length} bytes`);
    console.log(`    Flag: ${flag}`);

    if (flag >= 27 && flag <= 30) {
      console.log(`    Type: P2PKH uncompressed (flag ${flag})`);
    } else if (flag >= 31 && flag <= 34) {
      console.log(`    Type: P2PKH compressed (flag ${flag})`);
    } else if (flag >= 35 && flag <= 38) {
      console.log(`    Type: P2SH-P2WPKH (flag ${flag})`);
    } else if (flag >= 39 && flag <= 42) {
      console.log(`    Type: P2WPKH (flag ${flag})`);
    } else {
      console.log(`    Type: Unknown (flag ${flag})`);
    }

    // At least one method should work
    const anyWorked = mainResult || strictResult || looseResult;

    console.log(`\n  Final result: ${anyWorked ? '✅ SUCCESS - Signature verified!' : '❌ FAILED - Could not verify'}`);

    expect(anyWorked).toBe(true);

    if (mainResult) {
      expect(methodResult.method).toBeDefined();
      console.log(`\n  ✅ FreeWallet signature successfully verified using ${methodResult.method}`);
    }
  });
});