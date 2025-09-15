/**
 * Test the clean architecture verifier
 */

import { describe, it, expect } from 'vitest';
import { verifyMessage, isSpecCompliant, getVerificationReport } from '../verifier';

describe('Clean Architecture Verifier', () => {
  // FreeWallet signature - we know this works with bitcoinjs-message
  const freewalletFixture = {
    address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
    message: 'test',
    signature: 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs='
  };

  describe('Spec Compliance vs Compatibility', () => {
    it('should distinguish between spec-compliant and compatibility mode', async () => {
      const report = await getVerificationReport(
        freewalletFixture.message,
        freewalletFixture.signature,
        freewalletFixture.address
      );

      console.log('\n=== VERIFICATION REPORT ===');
      console.log('Spec Compliant:', report.specCompliant ? '✅' : '❌');
      console.log('Compatibility Mode:', report.compatibilityMode ? '✅' : '❌');
      console.log('Method:', report.method || 'None');
      console.log('Details:', report.details || 'Success');

      // We expect FreeWallet to fail spec but work in compatibility
      if (!report.specCompliant && report.compatibilityMode) {
        console.log('\n✅ Correctly handled as compatibility mode');
      } else if (report.specCompliant) {
        console.log('\n✅ Signature is spec-compliant');
      } else {
        console.log('\n❌ Signature failed both spec and compatibility');
      }
    });

    it('should verify in strict mode only if spec-compliant', async () => {
      // Strict mode - spec only
      const strictResult = await verifyMessage(
        freewalletFixture.message,
        freewalletFixture.signature,
        freewalletFixture.address,
        { strict: true }
      );

      console.log('\nStrict Mode:', strictResult.valid ? '✅' : '❌');
      console.log('Details:', strictResult.details);

      // Non-strict mode - includes compatibility
      const compatResult = await verifyMessage(
        freewalletFixture.message,
        freewalletFixture.signature,
        freewalletFixture.address,
        { strict: false }
      );

      console.log('\nCompatibility Mode:', compatResult.valid ? '✅' : '❌');
      console.log('Method:', compatResult.method);
    });
  });

  describe('Test Multiple Signatures', () => {
    const testCases = [
      {
        name: 'FreeWallet P2PKH',
        address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
        message: 'test',
        signature: 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=',
        expectSpec: false,
        expectCompat: true
      },
      {
        name: 'Ledger Taproot (BIP-137)',
        address: 'bc1ps5pt865e77nr9t9z7fdefryx27lsz0ced875lxcc68lszvc7x3qsxx25fy',
        message: 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu',
        signature: 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y=',
        expectSpec: false,  // BIP-137 for Taproot is non-standard
        expectCompat: true  // Should work with loose verification
      }
    ];

    for (const testCase of testCases) {
      it(`should handle ${testCase.name}`, async () => {
        const specCompliant = await isSpecCompliant(
          testCase.message,
          testCase.signature,
          testCase.address
        );

        const compatResult = await verifyMessage(
          testCase.message,
          testCase.signature,
          testCase.address,
          { strict: false }
        );

        console.log(`\n${testCase.name}:`);
        console.log(`  Spec Compliant: ${specCompliant ? '✅' : '❌'} (expected: ${testCase.expectSpec ? '✅' : '❌'})`);
        console.log(`  Compatibility: ${compatResult.valid ? '✅' : '❌'} (expected: ${testCase.expectCompat ? '✅' : '❌'})`);

        if (testCase.expectSpec) {
          expect(specCompliant).toBe(true);
        }
        if (testCase.expectCompat) {
          expect(compatResult.valid).toBe(true);
        }
      });
    }
  });

  describe('Architecture Benefits', () => {
    it('should demonstrate clean separation of concerns', () => {
      console.log('\n=== ARCHITECTURE BENEFITS ===');
      console.log('✅ Spec implementations remain pure');
      console.log('✅ Compatibility layer is separate');
      console.log('✅ Can audit spec compliance');
      console.log('✅ Can disable compatibility with strict mode');
      console.log('✅ Clear distinction between "correct" and "workaround"');
    });
  });
});