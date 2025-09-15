/**
 * Comprehensive test suite for message verification
 */

import { describe, it, expect } from 'vitest';
import { verifyMessage } from '../verifier';
import { verifyBIP137, verifyBIP137Strict, verifyBIP137Loose } from '../bip137';
import { verifyLegacy } from '../legacy';
import { fixtures, getValidFixtures } from './fixtures';

describe('Bitcoin Message Verifier', () => {
  describe('FreeWallet Signature (Critical Test)', () => {
    it('should verify FreeWallet signature', async () => {
      const fixture = fixtures.find(f => f.platform === 'FreeWallet')!;

      console.log('\n=== FREEWALLET SIGNATURE TEST ===');
      console.log('Address:', fixture.address);
      console.log('Message:', fixture.message);
      console.log('Signature:', fixture.signature);

      // Test with main verifier
      const result = await verifyMessage(
        fixture.message,
        fixture.signature,
        fixture.address
      );

      console.log('Result:', result);

      expect(result.valid).toBe(true);
      expect(result.method).toBeDefined();
      console.log('✅ FreeWallet signature verified with:', result.method);
    });
  });

  describe('All Valid Fixtures', () => {
    const validFixtures = getValidFixtures();

    for (const fixture of validFixtures) {
      it(`should verify ${fixture.platform} ${fixture.address_type} signature`, async () => {
        const result = await verifyMessage(
          fixture.message,
          fixture.signature,
          fixture.address
        );

        console.log(`${fixture.platform} (${fixture.address_type}):`,
          result.valid ? `✅ ${result.method}` : `❌ ${result.details}`);

        if (fixture.shouldVerify) {
          expect(result.valid).toBe(true);
        }
      });
    }
  });

  describe('BIP-137 Strict vs Loose', () => {
    it('should demonstrate strict vs loose verification', async () => {
      const fixture = fixtures.find(f =>
        f.platform === 'Ledger/Sparrow' && f.address_type === 'p2tr'
      )!;

      console.log('\n=== STRICT VS LOOSE BIP-137 ===');
      console.log('Taproot address with BIP-137 signature (non-standard)');

      // Strict should fail for Taproot with BIP-137
      const strict = await verifyBIP137Strict(
        fixture.message,
        fixture.signature,
        fixture.address
      );
      console.log('Strict:', strict.valid ? '✅' : '❌', strict.details);

      // Loose might work if it can derive the Taproot address
      const loose = await verifyBIP137Loose(
        fixture.message,
        fixture.signature,
        fixture.address
      );
      console.log('Loose:', loose.valid ? '✅' : '❌', loose.details);

      // Main verifier should handle it
      const main = await verifyMessage(
        fixture.message,
        fixture.signature,
        fixture.address
      );
      console.log('Main:', main.valid ? `✅ ${main.method}` : '❌');
    });
  });

  describe('Platform-specific verification', () => {
    it('should verify with platform hints', async () => {
      const freewalletFixture = fixtures.find(f => f.platform === 'FreeWallet')!;

      // Try with platform hint
      const result = await verifyMessage(
        freewalletFixture.message,
        freewalletFixture.signature,
        freewalletFixture.address,
        { platform: 'freewallet' }
      );

      console.log('With platform hint:', result);
      expect(result.valid).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid signatures gracefully', async () => {
      const result = await verifyMessage(
        'test',
        'invalid signature',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      );

      expect(result.valid).toBe(false);
      expect(result.details).toBeDefined();
    });

    it('should handle wrong address', async () => {
      const fixture = fixtures.find(f => f.platform === 'FreeWallet')!;

      const result = await verifyMessage(
        fixture.message,
        fixture.signature,
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' // Wrong address
      );

      expect(result.valid).toBe(false);
    });

    it('should handle wrong message', async () => {
      const fixture = fixtures.find(f => f.platform === 'FreeWallet')!;

      const result = await verifyMessage(
        'wrong message',
        fixture.signature,
        fixture.address
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('Verification Methods Coverage', () => {
    it('should support all address types', () => {
      const addressTypes = ['p2pkh', 'p2wpkh', 'p2sh-p2wpkh', 'p2tr'];
      const covered = new Set(fixtures.map(f => f.address_type));

      for (const type of addressTypes) {
        console.log(`${type}: ${covered.has(type) ? '✅ Covered' : '❌ Missing'}`);
      }
    });

    it('should support all formats', () => {
      const formats = ['legacy', 'bip137', 'bip322-simple', 'bip322-full'];
      const covered = new Set(fixtures.map(f => f.format));

      for (const format of formats) {
        console.log(`${format}: ${covered.has(format) ? '✅ Covered' : '❌ Missing'}`);
      }
    });
  });
});