/**
 * Real-World Signature Test Fixtures
 *
 * This test file collects actual signatures from various Bitcoin wallets
 * to ensure our verifier works with real-world implementations.
 *
 * Design principle: Test against existing verification order without polluting specs
 */

import { describe, it, expect } from 'vitest';
import { verifyMessage } from '../verifier';

describe('Real-World Bitcoin Signature Compatibility', () => {

  describe('Verified Working Signatures', () => {
    // These are signatures we've actually tested and verified

    it('should verify FreeWallet P2PKH signature', async () => {
      // Real signature from FreeWallet - verified working
      const fixture = {
        address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
        message: 'test',
        signature: 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs='
      };

      const result = await verifyMessage(fixture.message, fixture.signature, fixture.address);
      expect(result.valid).toBe(true);
      expect(result.method).toContain('BIP-137'); // Could be strict or loose

      console.log('FreeWallet result:', result);
    });

    it('should verify Ledger Taproot test signature', async () => {
      // Test signature for Ledger Taproot compatibility (BIP-137 format for P2TR)
      const fixture = {
        address: 'bc1ps5pt865e77nr9t9z7fdefryx27lsz0ced875lxcc68lszvc7x3qsxx25fy',
        message: 'bitcheckdiuq5gh179v9r5vwmw58ijtkea1vb4idr92khiu',
        signature: 'HxOxevYmNjW58m/TBcewrpLbOC0NXjwnWO+jccW9tq8JbdtjI8modbmYbJNVO6PpE9MATfiZeU/S/GbmozNhV4Y='
      };

      const result = await verifyMessage(fixture.message, fixture.signature, fixture.address);
      expect(result.valid).toBe(true);
      expect(result.method).toContain('Loose BIP-137'); // Non-standard BIP-137 for Taproot

      console.log('Ledger Taproot result:', result);
    });
  });

});

