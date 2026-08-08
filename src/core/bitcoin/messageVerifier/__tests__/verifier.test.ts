/**
 * Test the clean architecture verifier
 */

import { describe, expect, it } from 'vitest';
import { getVerificationReport, isSpecCompliant, verifyMessage } from '../verifier';

describe('Clean Architecture Verifier', () => {
  // FreeWallet signature - header 31 over a P2PKH address, which is textbook
  // BIP-137, so it verifies against the spec with no compatibility layer.
  const freewalletFixture = {
    address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
    message: 'test',
    signature: 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs='
  };

  // Ledger signs Taproot with BIP-137, which the spec does not cover. This is
  // the signature that actually needs the compatibility layer.
  const taprootFixture = {
    address: 'bc1ps5pt865e77nr9t9z7fdefryx27lsz0ced875lxcc68lszvc7x3qsxx25fy',
    message: 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu',
    signature: 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y='
  };

  describe('Spec Compliance vs Compatibility', () => {
    it('should distinguish between spec-compliant and compatibility mode', async () => {
      const specReport = await getVerificationReport(
        freewalletFixture.message,
        freewalletFixture.signature,
        freewalletFixture.address
      );

      const compatReport = await getVerificationReport(
        taprootFixture.message,
        taprootFixture.signature,
        taprootFixture.address
      );

      // The distinction this module exists to draw: one signature satisfies the
      // spec outright, the other only verifies through the compatibility layer.
      expect(specReport.specCompliant).toBe(true);
      expect(compatReport.specCompliant).toBe(false);
      expect(compatReport.compatibilityMode).toBe(true);
    });

    it('should verify in strict mode only if spec-compliant', async () => {
      // Strict mode - spec only
      const strictResult = await verifyMessage(
        taprootFixture.message,
        taprootFixture.signature,
        taprootFixture.address,
        { strict: true }
      );

      // Non-strict mode - includes compatibility
      const compatResult = await verifyMessage(
        taprootFixture.message,
        taprootFixture.signature,
        taprootFixture.address,
        { strict: false }
      );

      // This is the whole point of strict mode: the same signature is refused
      // by the spec and accepted by the compatibility layer. Asserted against
      // the Taproot fixture, since the P2PKH one passes the spec either way.
      expect(strictResult.valid).toBe(false);
      expect(compatResult.valid).toBe(true);
    });
  });

  describe('Test Multiple Signatures', () => {
    const testCases = [
      {
        name: 'FreeWallet P2PKH',
        address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
        message: 'test',
        signature: 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=',
        expectSpec: true,
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

        // Assert both directions. Guarding these behind `if (expected)` meant
        // every false expectation went unchecked, and both fixtures expect
        // false for spec compliance -- so that half was never tested at all.
        expect(specCompliant).toBe(testCase.expectSpec);
        expect(compatResult.valid).toBe(testCase.expectCompat);
      });
    }
  });
});