/**
 * Counterparty Address Packing/Unpacking
 *
 * Counterparty uses a 21-byte packed address format in messages:
 *
 * For P2PKH (legacy) addresses:
 *   - Byte 0: Version byte (0x00 for mainnet P2PKH, 0x05 for P2SH)
 *   - Bytes 1-20: 20-byte pubkey hash (HASH160)
 *
 * For SegWit (P2WPKH) addresses:
 *   - Byte 0: 0x80 + witness_version (0x80 for witness v0)
 *   - Bytes 1-20: 20-byte witness program
 *
 * For Taproot (P2TR) addresses:
 *   - Byte 0: 0x80 + witness_version (0x81 for witness v1)
 *   - Bytes 1-20: First 20 bytes of 32-byte witness program (truncated)
 *   - Note: This is lossy - we cannot fully reconstruct P2TR addresses from packed form
 *
 * The pack/unpack functions convert between Bitcoin addresses and this 21-byte format.
 */

import { bech32, bech32m, base58 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';

/** Length of packed address in bytes */
export const PACKED_ADDRESS_LENGTH = 21;

/** Version byte prefixes for mainnet */
const VERSION = {
  P2PKH: 0x00,       // Legacy pay-to-pubkey-hash
  P2SH: 0x05,        // Pay-to-script-hash
  SEGWIT_MARKER: 0x80, // Added to witness version for SegWit
} as const;

/**
 * Error thrown when address packing/unpacking fails
 */
export class AddressPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddressPackError';
  }
}

/**
 * Decode base58check address and return version byte + hash.
 */
function decodeBase58Check(address: string): { version: number; hash: Uint8Array } {
  try {
    // Decode base58
    const decoded = base58.decode(address);

    if (decoded.length < 5) {
      throw new AddressPackError('Address too short');
    }

    // Last 4 bytes are checksum
    const payload = decoded.slice(0, -4);
    const checksum = decoded.slice(-4);

    // Verify checksum (double SHA-256)
    const hash1 = sha256(payload);
    const hash2 = sha256(hash1);
    const expectedChecksum = hash2.slice(0, 4);

    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== expectedChecksum[i]) {
        throw new AddressPackError('Invalid checksum');
      }
    }

    return {
      version: payload[0],
      hash: payload.slice(1),
    };
  } catch (error) {
    if (error instanceof AddressPackError) throw error;
    throw new AddressPackError(`Invalid base58check address: ${error}`);
  }
}

/**
 * Encode version byte + hash to base58check address.
 */
function encodeBase58Check(version: number, hash: Uint8Array): string {
  const payload = new Uint8Array(1 + hash.length);
  payload[0] = version;
  payload.set(hash, 1);

  // Calculate checksum (double SHA-256)
  const hash1 = sha256(payload);
  const hash2 = sha256(hash1);
  const checksum = hash2.slice(0, 4);

  // Combine payload + checksum
  const result = new Uint8Array(payload.length + 4);
  result.set(payload);
  result.set(checksum, payload.length);

  return base58.encode(result);
}

/**
 * Decode a bech32/bech32m address and return witness version + program.
 */
function decodeBech32(address: string): { version: number; program: Uint8Array } {
  try {
    // Try bech32 first (for witness v0)
    try {
      const decoded = bech32.decode(address as `${string}1${string}`);
      if (decoded.prefix !== 'bc' && decoded.prefix !== 'tb') {
        throw new AddressPackError('Invalid bech32 prefix');
      }
      const version = decoded.words[0];
      const program = bech32.fromWords(decoded.words.slice(1));
      return { version, program: new Uint8Array(program) };
    } catch {
      // Try bech32m (for witness v1+)
      const decoded = bech32m.decode(address as `${string}1${string}`);
      if (decoded.prefix !== 'bc' && decoded.prefix !== 'tb') {
        throw new AddressPackError('Invalid bech32m prefix');
      }
      const version = decoded.words[0];
      const program = bech32m.fromWords(decoded.words.slice(1));
      return { version, program: new Uint8Array(program) };
    }
  } catch (error) {
    if (error instanceof AddressPackError) throw error;
    throw new AddressPackError(`Invalid bech32 address: ${error}`);
  }
}

/**
 * Encode witness version + program to bech32/bech32m address.
 */
function encodeBech32(version: number, program: Uint8Array, prefix: string = 'bc'): string {
  const words = [version, ...bech32.toWords(program)];

  if (version === 0) {
    return bech32.encode(prefix, words);
  } else {
    return bech32m.encode(prefix, words);
  }
}

/**
 * Pack a Bitcoin address into 21-byte Counterparty format.
 *
 * @param address - Bitcoin address string (legacy, SegWit, or Taproot)
 * @returns 21-byte packed address
 * @throws AddressPackError if the address is invalid or unsupported
 */
export function packAddress(address: string): Uint8Array {
  if (!address || typeof address !== 'string') {
    throw new AddressPackError('Address is required');
  }

  const packed = new Uint8Array(PACKED_ADDRESS_LENGTH);

  // Check for bech32/bech32m (SegWit) address
  if (address.toLowerCase().startsWith('bc1') || address.toLowerCase().startsWith('tb1')) {
    const { version, program } = decodeBech32(address);

    // Mark as SegWit with version
    packed[0] = VERSION.SEGWIT_MARKER + version;

    // P2WPKH has 20-byte program, P2TR has 32-byte program
    if (program.length === 20) {
      // P2WPKH - fits exactly
      packed.set(program, 1);
    } else if (program.length === 32) {
      // P2TR - truncate to 20 bytes (lossy!)
      // Note: This means we can't fully reconstruct P2TR addresses
      packed.set(program.slice(0, 20), 1);
    } else {
      throw new AddressPackError(`Unsupported witness program length: ${program.length}`);
    }

    return packed;
  }

  // Check for base58 (legacy) address
  if (address.startsWith('1') || address.startsWith('3') ||
      address.startsWith('m') || address.startsWith('n') || address.startsWith('2')) {
    const { version, hash } = decodeBase58Check(address);

    if (hash.length !== 20) {
      throw new AddressPackError(`Invalid hash length: ${hash.length}`);
    }

    packed[0] = version;
    packed.set(hash, 1);

    return packed;
  }

  throw new AddressPackError(`Unsupported address format: ${address}`);
}

/**
 * Unpack a 21-byte Counterparty packed address to a Bitcoin address string.
 *
 * @param packed - 21-byte packed address
 * @param network - 'mainnet' or 'testnet' (default: 'mainnet')
 * @returns Bitcoin address string
 * @throws AddressPackError if the packed address is invalid
 */
export function unpackAddress(packed: Uint8Array, network: 'mainnet' | 'testnet' = 'mainnet'): string {
  if (!packed || packed.length === 0) {
    throw new AddressPackError('Empty packed address');
  }

  if (packed.length !== PACKED_ADDRESS_LENGTH) {
    throw new AddressPackError(`Invalid packed address length: ${packed.length} (expected ${PACKED_ADDRESS_LENGTH})`);
  }

  const firstByte = packed[0];
  const hashOrProgram = packed.slice(1);

  // Check for SegWit marker (0x80 - 0x8F)
  if (firstByte >= VERSION.SEGWIT_MARKER && firstByte <= VERSION.SEGWIT_MARKER + 0x0F) {
    const witnessVersion = firstByte - VERSION.SEGWIT_MARKER;
    const prefix = network === 'mainnet' ? 'bc' : 'tb';

    // Note: For P2TR (witness v1), the packed format only contains 20 bytes
    // of the 32-byte witness program, so we cannot fully reconstruct it.
    // We assume P2WPKH (20-byte program) for unpacking.
    if (witnessVersion === 1) {
      // This is P2TR but we only have 20 bytes - cannot reconstruct
      // For now, treat it as if we have the full program (caller should be aware)
      console.warn('P2TR address unpacking may be incomplete (only 20 of 32 bytes available)');
    }

    return encodeBech32(witnessVersion, hashOrProgram, prefix);
  }

  // Legacy address (P2PKH or P2SH)
  return encodeBase58Check(firstByte, hashOrProgram);
}

/**
 * Check if a packed address represents a SegWit address.
 */
export function isSegwitPacked(packed: Uint8Array): boolean {
  if (packed.length < 1) return false;
  return packed[0] >= VERSION.SEGWIT_MARKER && packed[0] <= VERSION.SEGWIT_MARKER + 0x0F;
}

/**
 * Get the witness version from a packed SegWit address.
 * Returns -1 if not a SegWit address.
 */
export function getWitnessVersion(packed: Uint8Array): number {
  if (!isSegwitPacked(packed)) return -1;
  return packed[0] - VERSION.SEGWIT_MARKER;
}

/**
 * Check if two addresses are equal (handles different formats).
 * This is useful for verification where addresses might be in different formats.
 */
export function addressesEqual(addr1: string, addr2: string): boolean {
  if (addr1 === addr2) return true;

  try {
    const packed1 = packAddress(addr1);
    const packed2 = packAddress(addr2);

    if (packed1.length !== packed2.length) return false;
    for (let i = 0; i < packed1.length; i++) {
      if (packed1[i] !== packed2[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}
