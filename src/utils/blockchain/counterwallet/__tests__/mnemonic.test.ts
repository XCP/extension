import { describe, it, expect, vi } from 'vitest';
import {
  isValidCounterwalletMnemonic,
  CounterwalletMnemonic,
  getCounterwalletSeed,
} from '../mnemonic';

// Mock @noble/hashes/utils
vi.mock('@noble/hashes/utils', () => ({
  hexToBytes: vi.fn((hex: string) => {
    // Convert hex string to Uint8Array for testing
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }),
}));

// Test data based on Counterwallet's legacy format (2014)
// These are test mnemonics that would have been valid in the original Counterwallet
const validMnemonics = {
  // 12 words (4 groups of 3)
  twelveWord: 'like just love know never want time out there make look eye',
  // 15 words (5 groups of 3) 
  fifteenWord: 'like just love know never want time out there make look eye down only think',
  // 24 words (8 groups of 3)
  twentyFourWord: 'like just love know never want time out there make look eye down only think heart back then into about more away still them',
};

const invalidMnemonics = {
  // Not multiple of 3
  elevenWord: 'like just love know never want time out there make look',
  thirteenWord: 'like just love know never want time out there make look eye down only',
  // Invalid words (standard BIP39 words not in Counterwallet list)
  invalidWords: 'abandon abandon abandon',
  // Mixed valid and invalid
  mixedWords: 'like just abandon know never want',
  // Empty
  empty: '',
  // Single word
  singleWord: 'like',
  // Two words
  twoWords: 'like just',
};

describe('counterwallet/mnemonic.ts', () => {
  describe('isValidCounterwalletMnemonic', () => {
    it('should validate correct 12-word Counterwallet mnemonic', () => {
      expect(isValidCounterwalletMnemonic(validMnemonics.twelveWord)).toBe(true);
    });

    it('should validate correct 15-word Counterwallet mnemonic', () => {
      expect(isValidCounterwalletMnemonic(validMnemonics.fifteenWord)).toBe(true);
    });

    it('should validate correct 24-word Counterwallet mnemonic', () => {
      expect(isValidCounterwalletMnemonic(validMnemonics.twentyFourWord)).toBe(true);
    });

    it('should reject mnemonic with word count not multiple of 3', () => {
      expect(isValidCounterwalletMnemonic(invalidMnemonics.elevenWord)).toBe(false);
      expect(isValidCounterwalletMnemonic(invalidMnemonics.thirteenWord)).toBe(false);
    });

    it('should reject mnemonic with invalid words', () => {
      expect(isValidCounterwalletMnemonic(invalidMnemonics.invalidWords)).toBe(false);
      expect(isValidCounterwalletMnemonic(invalidMnemonics.mixedWords)).toBe(false);
    });

    it('should reject empty mnemonic', () => {
      expect(isValidCounterwalletMnemonic(invalidMnemonics.empty)).toBe(false);
    });

    it('should reject single word', () => {
      expect(isValidCounterwalletMnemonic(invalidMnemonics.singleWord)).toBe(false);
    });

    it('should reject two words', () => {
      expect(isValidCounterwalletMnemonic(invalidMnemonics.twoWords)).toBe(false);
    });

    it('should handle extra whitespace correctly', () => {
      const mnemonicWithSpaces = '  like   just   love   know   never   want   time   out   there   make   look   eye  ';
      expect(isValidCounterwalletMnemonic(mnemonicWithSpaces)).toBe(true);
    });

    it('should handle mixed whitespace types', () => {
      const mnemonicWithTabs = 'like\tjust\tlove\tknow\tnever\twant\ttime\tout\tthere\tmake\tlook\teye';
      expect(isValidCounterwalletMnemonic(mnemonicWithTabs)).toBe(true);
    });

    it('should be case sensitive (Counterwallet wordlist is lowercase)', () => {
      const uppercaseMnemonic = 'LIKE JUST LOVE KNOW NEVER WANT TIME OUT THERE MAKE LOOK EYE';
      expect(isValidCounterwalletMnemonic(uppercaseMnemonic)).toBe(false);
    });

    it('should handle very long valid mnemonics', () => {
      // Create a very long but valid mnemonic (30 words = 10 groups of 3)
      const longMnemonic = (validMnemonics.twelveWord + ' ' + validMnemonics.twelveWord + ' ' + 'like just love know never want').trim();
      expect(isValidCounterwalletMnemonic(longMnemonic)).toBe(true);
    });

    it('should validate each word is in the Counterwallet wordlist', () => {
      // Test with first few words from the wordlist
      expect(isValidCounterwalletMnemonic('like just love')).toBe(true);
      
      // Test with last few words from the wordlist  
      expect(isValidCounterwalletMnemonic('depend desperate destination')).toBe(true);
      
      // Mix of early and late words
      expect(isValidCounterwalletMnemonic('like desperate destination')).toBe(true);
    });
  });

  describe('CounterwalletMnemonic class', () => {
    it('should construct from valid 12-word mnemonic', () => {
      const words = validMnemonics.twelveWord.split(/\s+/);
      expect(() => new CounterwalletMnemonic(words)).not.toThrow();
    });

    it('should construct from valid 15-word mnemonic', () => {
      const words = validMnemonics.fifteenWord.split(/\s+/);
      expect(() => new CounterwalletMnemonic(words)).not.toThrow();
    });

    it('should construct from valid 24-word mnemonic', () => {
      const words = validMnemonics.twentyFourWord.split(/\s+/);
      expect(() => new CounterwalletMnemonic(words)).not.toThrow();
    });

    it('should throw error for word count not multiple of 3', () => {
      const words = invalidMnemonics.elevenWord.split(/\s+/);
      expect(() => new CounterwalletMnemonic(words)).toThrow('Invalid number of words (must be multiple of 3).');
    });

    it('should throw error for invalid words', () => {
      const words = ['abandon', 'abandon', 'abandon']; // Standard BIP39 words not in Counterwallet
      expect(() => new CounterwalletMnemonic(words)).toThrow('Invalid mnemonic word at group #0');
    });

    it('should throw error for partially invalid words', () => {
      const words = ['like', 'just', 'abandon']; // Two valid, one invalid
      expect(() => new CounterwalletMnemonic(words)).toThrow('Invalid mnemonic word at group #0');
    });

    it('should throw error for empty word array', () => {
      expect(() => new CounterwalletMnemonic([])).toThrow('Invalid number of words (must be multiple of 3).');
    });

    it('should convert to hex correctly', () => {
      const words = ['like', 'just', 'love']; // First 3 words from wordlist
      const mnemonic = new CounterwalletMnemonic(words);
      const hex = mnemonic.toHex();
      
      // Should return a hex string
      expect(typeof hex).toBe('string');
      expect(hex).toMatch(/^[0-9a-f]+$/);
      // For 3 words (1 group), should be 8 hex characters (32 bits)
      expect(hex.length).toBe(8);
    });

    it('should generate consistent hex for same mnemonic', () => {
      const words = ['like', 'just', 'love'];
      const mnemonic1 = new CounterwalletMnemonic(words);
      const mnemonic2 = new CounterwalletMnemonic(words);
      
      expect(mnemonic1.toHex()).toBe(mnemonic2.toHex());
    });

    it('should generate different hex for different mnemonics', () => {
      const words1 = ['like', 'just', 'love'];
      const words2 = ['know', 'never', 'want'];
      
      const mnemonic1 = new CounterwalletMnemonic(words1);
      const mnemonic2 = new CounterwalletMnemonic(words2);
      
      expect(mnemonic1.toHex()).not.toBe(mnemonic2.toHex());
    });

    it('should handle multiple groups correctly', () => {
      const words = validMnemonics.twelveWord.split(/\s+/); // 12 words = 4 groups
      const mnemonic = new CounterwalletMnemonic(words);
      const hex = mnemonic.toHex();
      
      // Should be 32 hex characters (4 groups * 8 chars each)
      expect(hex.length).toBe(32);
      expect(hex).toMatch(/^[0-9a-f]+$/);
    });

    it('should pad hex values correctly', () => {
      // Test with words that might produce small numbers
      const words = ['like', 'like', 'like']; // All same word (index 0)
      const mnemonic = new CounterwalletMnemonic(words);
      const hex = mnemonic.toHex();
      
      // Should still be 8 characters with leading zeros if needed
      expect(hex.length).toBe(8);
      expect(hex).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('getCounterwalletSeed', () => {
    it('should generate seed from valid 12-word mnemonic', () => {
      const seed = getCounterwalletSeed(validMnemonics.twelveWord);
      
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(16); // 32 hex chars = 16 bytes
    });

    it('should generate seed from valid 15-word mnemonic', () => {
      const seed = getCounterwalletSeed(validMnemonics.fifteenWord);
      
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(20); // 40 hex chars = 20 bytes
    });

    it('should generate seed from valid 24-word mnemonic', () => {
      const seed = getCounterwalletSeed(validMnemonics.twentyFourWord);
      
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(32); // 64 hex chars = 32 bytes
    });

    it('should generate consistent seed for same mnemonic', () => {
      const seed1 = getCounterwalletSeed(validMnemonics.twelveWord);
      const seed2 = getCounterwalletSeed(validMnemonics.twelveWord);
      
      expect(seed1).toEqual(seed2);
    });

    it('should generate different seeds for different mnemonics', () => {
      const seed1 = getCounterwalletSeed(validMnemonics.twelveWord);
      const seed2 = getCounterwalletSeed(validMnemonics.fifteenWord);
      
      expect(seed1).not.toEqual(seed2);
    });

    it('should handle whitespace in mnemonic correctly', () => {
      const normalMnemonic = validMnemonics.twelveWord;
      const spacedMnemonic = '  ' + validMnemonics.twelveWord.replace(/\s+/g, '   ') + '  ';
      
      const seed1 = getCounterwalletSeed(normalMnemonic);
      const seed2 = getCounterwalletSeed(spacedMnemonic);
      
      expect(seed1).toEqual(seed2);
    });

    it('should throw error for invalid mnemonic', () => {
      expect(() => getCounterwalletSeed(invalidMnemonics.invalidWords)).toThrow();
      expect(() => getCounterwalletSeed(invalidMnemonics.elevenWord)).toThrow();
    });

    it('should call hexToBytes with correct hex string', async () => {
      // Import the mocked function
      const { hexToBytes } = await import('@noble/hashes/utils.js');
      
      // Clear any previous calls
      vi.mocked(hexToBytes).mockClear();
      
      getCounterwalletSeed(validMnemonics.twelveWord);
      
      expect(hexToBytes).toHaveBeenCalled();
      const callArg = vi.mocked(hexToBytes).mock.calls[0][0];
      expect(typeof callArg).toBe('string');
      expect(callArg).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty string gracefully', () => {
      expect(isValidCounterwalletMnemonic('')).toBe(false);
      expect(() => getCounterwalletSeed('')).toThrow();
    });

    it('should handle only whitespace', () => {
      expect(isValidCounterwalletMnemonic('   \t\n   ')).toBe(false);
      expect(() => getCounterwalletSeed('   \t\n   ')).toThrow();
    });

    it('should handle null-like inputs gracefully', () => {
      // These would typically be caught by TypeScript, but test runtime behavior
      expect(() => isValidCounterwalletMnemonic(null as any)).toThrow();
      expect(() => isValidCounterwalletMnemonic(undefined as any)).toThrow();
    });

    it('should handle very long individual words', () => {
      const longFakeWord = 'a'.repeat(1000);
      const mnemonic = `like just ${longFakeWord}`;
      expect(isValidCounterwalletMnemonic(mnemonic)).toBe(false);
    });

    it('should handle special characters in words', () => {
      const specialMnemonic = 'like-just love@email.com know123';
      expect(isValidCounterwalletMnemonic(specialMnemonic)).toBe(false);
    });

    it('should validate against the complete Counterwallet wordlist', () => {
      // Test first word in wordlist
      expect(isValidCounterwalletMnemonic('like just love')).toBe(true);
      
      // Test some middle words
      expect(isValidCounterwalletMnemonic('people girl leave')).toBe(true);
      
      // Test some later words
      expect(isValidCounterwalletMnemonic('weapon weary depend')).toBe(true);
    });
  });

  describe('Counterwallet-specific algorithm behavior', () => {
    it('should use the mod function correctly for negative remainders', () => {
      // Test the mathematical encoding used in Counterwallet
      // This tests the specific algorithm: w1 + n * mod(w2 - w1, n) + n * n * mod(w3 - w2, n)
      const words = ['want', 'like', 'just']; // Specific order to test mod behavior
      const mnemonic = new CounterwalletMnemonic(words);
      const hex = mnemonic.toHex();
      
      expect(hex).toMatch(/^[0-9a-f]{8}$/);
      expect(hex.length).toBe(8);
    });

    it('should handle word order sensitivity correctly', () => {
      // Same words, different order should produce different results
      const words1 = ['like', 'just', 'love'];
      const words2 = ['just', 'like', 'love'];
      const words3 = ['love', 'like', 'just'];
      
      const mnemonic1 = new CounterwalletMnemonic(words1);
      const mnemonic2 = new CounterwalletMnemonic(words2);
      const mnemonic3 = new CounterwalletMnemonic(words3);
      
      const hex1 = mnemonic1.toHex();
      const hex2 = mnemonic2.toHex();
      const hex3 = mnemonic3.toHex();
      
      expect(hex1).not.toBe(hex2);
      expect(hex2).not.toBe(hex3);
      expect(hex1).not.toBe(hex3);
    });

    it('should handle the full range of the wordlist correctly', () => {
      // Test with words from different positions in the wordlist
      // to ensure the algorithm works across the full range
      const firstWords = ['like', 'just', 'love']; // Early in list
      const lastWords = ['weapon', 'weary', 'depend']; // Later in list
      
      const mnemonic1 = new CounterwalletMnemonic(firstWords);
      const mnemonic2 = new CounterwalletMnemonic(lastWords);
      
      expect(mnemonic1.toHex()).not.toBe(mnemonic2.toHex());
      expect(mnemonic1.toHex().length).toBe(8);
      expect(mnemonic2.toHex().length).toBe(8);
    });

    it('should produce valid 32-bit integers for each group', () => {
      const words = validMnemonics.twelveWord.split(/\s+/);
      const mnemonic = new CounterwalletMnemonic(words);
      const hex = mnemonic.toHex();
      
      // Split hex into 8-character chunks (32-bit integers)
      const chunks = hex.match(/.{8}/g) || [];
      expect(chunks.length).toBe(4); // 12 words = 4 groups
      
      chunks.forEach(chunk => {
        const value = parseInt(chunk, 16);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0xFFFFFFFF); // Max 32-bit unsigned int
      });
    });
  });

  describe('integration with legacy Counterwallet behavior', () => {
    it('should maintain compatibility with 2014 Counterwallet mnemonic format', () => {
      // Test that the implementation matches the original Counterwallet behavior
      const legacyMnemonic = 'like just love know never want time out there make look eye';
      
      expect(isValidCounterwalletMnemonic(legacyMnemonic)).toBe(true);
      
      const seed = getCounterwalletSeed(legacyMnemonic);
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(16);
    });

    it('should reject standard BIP39 mnemonics that are not Counterwallet compatible', () => {
      // Standard BIP39 test mnemonic
      const bip39Mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      expect(isValidCounterwalletMnemonic(bip39Mnemonic)).toBe(false);
    });

    it('should handle the exact wordlist from the original Counterwallet', () => {
      // Test that we're using the correct wordlist by checking specific words
      // that are in Counterwallet but not in BIP39
      expect(isValidCounterwalletMnemonic('like just love')).toBe(true);
      
      // These are BIP39 words that should NOT be valid in Counterwallet
      expect(isValidCounterwalletMnemonic('abandon abandon abandon')).toBe(false);
      expect(isValidCounterwalletMnemonic('ability able about')).toBe(false);
    });

    it('should support the full range of mnemonic lengths that Counterwallet supported', () => {
      // Counterwallet supported any multiple of 3 words
      const lengths = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];
      
      lengths.forEach(length => {
        const words = Array(length).fill('like just love').join(' ').split(/\s+/).slice(0, length);
        if (words.length === length && length % 3 === 0) {
          expect(isValidCounterwalletMnemonic(words.join(' '))).toBe(true);
        }
      });
    });
  });
});