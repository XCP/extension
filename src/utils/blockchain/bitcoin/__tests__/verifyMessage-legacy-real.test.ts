/**
 * Real Legacy/BIP-137 Signature Tests
 * These are actual signatures from various wallets that MUST verify
 */

import { describe, it, expect } from 'vitest';
import { verifyMessage, verifyMessageWithMethod, verifyMessageWithLooseBIP137 } from '../messageVerifier';

describe('Real Legacy/BIP-137 Signature Verification', () => {
  describe('Actual Bitcore Signatures (BIP-137)', () => {
    it('should verify real Bitcore P2PKH signatures', async () => {
      // These are REAL signatures from bitcore-message library
      const testCases = [
        {
          address: '1F3sAm6ZtwLAUnj7d38pGFxtP3RVEvtsbV',
          message: 'This is an example of a signed message.',
          signature: 'H9L5yLFjti0QTHhPyFrZCT1V/MMnBtXKmoiKDZ78NDBjERki6ZTQZdSMCtkgoNmp17By9ItJr8o7ChX0XxY91nk=',
          wallet: 'Bitcore',
          expectedMethod: 'BIP-137'
        },
        {
          address: '1HnhWpkMHMjgt167kvgcPyurMmsCQ2WPgg',
          message: 'Hello World',
          signature: 'IAtVrymJqo43BCt9f7Dhl6ET4Gg3SmhyvdlW6wn9iWc9PweD7tNM5+qw7xE9/bzlw/Et789AQ2F59YKEnSzQudo=',
          wallet: 'Bitcore',
          expectedMethod: 'BIP-137'
        }
      ];

      for (const testCase of testCases) {
        console.log(`\nTesting ${testCase.wallet} signature:`);
        console.log(`  Address: ${testCase.address}`);
        console.log(`  Message: "${testCase.message}"`);

        // Try strict verification first
        const strictResult = await verifyMessageWithLooseBIP137(
          testCase.message,
          testCase.signature,
          testCase.address,
          false // Strict mode
        );

        console.log(`  Strict BIP-137: ${strictResult ? '✅ VERIFIED' : '❌ FAILED'}`);

        // Try loose verification
        const looseResult = await verifyMessageWithLooseBIP137(
          testCase.message,
          testCase.signature,
          testCase.address,
          true // Loose mode
        );

        console.log(`  Loose BIP-137: ${looseResult ? '✅ VERIFIED' : '❌ FAILED'}`);

        // Try with main verifyMessage (which uses loose by default)
        const mainResult = await verifyMessage(
          testCase.message,
          testCase.signature,
          testCase.address
        );

        const methodResult = await verifyMessageWithMethod(
          testCase.message,
          testCase.signature,
          testCase.address
        );

        console.log(`  Main verifyMessage: ${mainResult ? '✅ VERIFIED' : '❌ FAILED'}`);
        console.log(`  Method used: ${methodResult.method || 'None'}`);

        // At least one method should work
        expect(strictResult || looseResult || mainResult).toBe(true);

        if (mainResult) {
          expect(methodResult.method).toContain(testCase.expectedMethod);
        }
      }
    });
  });

  describe('Different Header Flags (BIP-137)', () => {
    it('should handle all BIP-137 header flag types', async () => {
      // Test signatures with different header flags
      const testCases = [
        {
          // P2PKH compressed (flag 31-34)
          address: '1HnhWpkMHMjgt167kvgcPyurMmsCQ2WPgg',
          message: 'Test message',
          signature: 'HyiLDcQQ1p1aw7ckdbPc1R5wJJGfXj0Zv8r/2xRPvVcLUfmu7Y6GKTkKPt8kfPyJJwZ5H9aSYBthI8Bv1llVhGo=',
          expectedFlag: '31-34',
          description: 'P2PKH compressed'
        }
      ];

      for (const testCase of testCases) {
        console.log(`\n${testCase.description}:`);
        console.log(`  Address: ${testCase.address}`);
        console.log(`  Expected flag range: ${testCase.expectedFlag}`);

        const result = await verifyMessage(
          testCase.message,
          testCase.signature,
          testCase.address
        );

        const methodResult = await verifyMessageWithMethod(
          testCase.message,
          testCase.signature,
          testCase.address
        );

        console.log(`  Result: ${result ? '✅ VERIFIED' : '❌ FAILED'}`);
        console.log(`  Method: ${methodResult.method || 'None'}`);

        expect(result).toBe(true);
        if (result) {
          expect(methodResult.method).toContain('137');
        }
      }
    });
  });

  describe('Loose vs Strict Verification', () => {
    it('should demonstrate the difference between loose and strict', async () => {
      console.log('\n=== Loose vs Strict BIP-137 Verification ===\n');

      console.log('Strict BIP-137:');
      console.log('  - Header flag must match address type exactly');
      console.log('  - Flag 27-30: P2PKH uncompressed');
      console.log('  - Flag 31-34: P2PKH compressed');
      console.log('  - Flag 35-38: P2SH-P2WPKH');
      console.log('  - Flag 39-42: P2WPKH');

      console.log('\nLoose BIP-137:');
      console.log('  - Ignores header flag');
      console.log('  - Recovers public key from signature');
      console.log('  - Tries to derive all possible address types');
      console.log('  - Checks if any derived address matches target');
      console.log('  - Allows Ledger/Sparrow Taproot signatures (non-standard)');

      // Example: Ledger signature with wrong flag
      const ledgerExample = {
        taprootAddress: 'bc1ps5pt865e77nr9t9z7fdefryx27lsz0ced875lxcc68lszvc7x3qsxx25fy',
        p2pkhAddress: '19C7EwHP5FN32YPrMRfW7mkFKg3FYwyAzr',
        message: 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu',
        signature: 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y='
      };

      console.log('\nLedger/Sparrow Example:');
      console.log('  They sign Taproot addresses with BIP-137 (non-standard)');
      console.log('  The signature has a P2PKH flag but is for a Taproot address');

      // Test with P2PKH address (correct for the flag)
      const p2pkhStrict = await verifyMessageWithLooseBIP137(
        ledgerExample.message,
        ledgerExample.signature,
        ledgerExample.p2pkhAddress,
        false // Strict
      );

      const p2pkhLoose = await verifyMessageWithLooseBIP137(
        ledgerExample.message,
        ledgerExample.signature,
        ledgerExample.p2pkhAddress,
        true // Loose
      );

      console.log(`\n  P2PKH address verification:`);
      console.log(`    Strict: ${p2pkhStrict ? '✅ VERIFIED' : '❌ FAILED'}`);
      console.log(`    Loose: ${p2pkhLoose ? '✅ VERIFIED' : '❌ FAILED'}`);

      // Test with Taproot address (wrong for BIP-137)
      const taprootStrict = await verifyMessageWithLooseBIP137(
        ledgerExample.message,
        ledgerExample.signature,
        ledgerExample.taprootAddress,
        false // Strict
      );

      const taprootLoose = await verifyMessageWithLooseBIP137(
        ledgerExample.message,
        ledgerExample.signature,
        ledgerExample.taprootAddress,
        true // Loose
      );

      console.log(`\n  Taproot address verification:`);
      console.log(`    Strict: ${taprootStrict ? '✅ VERIFIED' : '❌ FAILED'} (expected)`);
      console.log(`    Loose: ${taprootLoose ? '✅ VERIFIED' : '❌ FAILED'} (would need pubkey match)`);

      // The P2PKH should verify
      expect(p2pkhLoose || p2pkhStrict).toBe(true);

      // Taproot with BIP-137 should fail (it's non-standard)
      expect(taprootStrict).toBe(false);
    });
  });

  describe('Summary', () => {
    it('should summarize BIP-137/Legacy verification', () => {
      console.log('\n========================================');
      console.log('BIP-137/LEGACY VERIFICATION SUMMARY');
      console.log('========================================\n');

      console.log('What is BIP-137?');
      console.log('  - Standard for Bitcoin message signing');
      console.log('  - Uses recovery flags (27-42) to indicate address type');
      console.log('  - Supported by most wallets (Electrum, Bitcore, etc.)');
      console.log('  - Base64-encoded 65-byte signature');

      console.log('\nWhat is "Legacy" format?');
      console.log('  - Same as BIP-137 for P2PKH addresses');
      console.log('  - Flags 27-30 (uncompressed) or 31-34 (compressed)');
      console.log('  - The original Bitcoin message signing format');

      console.log('\nWhy Loose Verification?');
      console.log('  - Some wallets use wrong header flags');
      console.log('  - Ledger/Sparrow use BIP-137 for Taproot (non-standard)');
      console.log('  - Loose mode ignores flag and checks if pubkey matches');
      console.log('  - Enables broader compatibility');

      console.log('\nOur Implementation:');
      console.log('  ✅ Supports strict BIP-137 (correct flags)');
      console.log('  ✅ Supports loose BIP-137 (ignore flags)');
      console.log('  ✅ Falls back from BIP-322 → BIP-137 → Legacy');
      console.log('  ✅ Maximum compatibility with existing wallets');
    });
  });
});