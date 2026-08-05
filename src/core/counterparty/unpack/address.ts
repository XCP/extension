/**
 * Counterparty Address Packing/Unpacking
 *
 * Two packed-address encodings exist on the wire.
 *
 * Legacy (pre-taproot_support), always 21 bytes:
 *   - P2PKH/P2SH: base58 version byte (0x00/0x05 mainnet) + 20-byte hash
 *   - SegWit v0:  0x80 + witness_version, + 20-byte witness program
 *   Taproot cannot be represented (a 32-byte program does not fit).
 *
 * Modern (taproot_support, counterparty-rs utils::pack), variable length:
 *   - 0x01 + 20-byte pubkey hash            → P2PKH
 *   - 0x02 + 20-byte script hash            → P2SH
 *   - 0x03 + witness_version + program      → any SegWit, including Taproot
 *
 * The modern prefixes cannot collide with legacy mainnet version bytes
 * (0x00/0x05) or the SegWit marker range (0x80+), so unpackAddress accepts
 * both encodings — historical messages contain the legacy form.
 *
 * packAddress emits the **modern** form for every address type, because that is what core produces
 * today: `lib/utils/address.py::pack` calls the Rust packer first and only falls back to legacy if
 * it raises, which it does not for a well-formed address. Composed-message verification compares
 * bytes, so emitting the legacy form here would differ from core on the first byte alone.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { base58, bech32, bech32m } from '@scure/base';

/** Length of a legacy packed address in bytes */
export const PACKED_ADDRESS_LENGTH = 21;

/** Version byte prefixes for mainnet */
const VERSION = {
  P2PKH: 0x00,       // Legacy pay-to-pubkey-hash
  P2SH: 0x05,        // Pay-to-script-hash
  SEGWIT_MARKER: 0x80, // Added to witness version for SegWit
} as const;

/** Modern (taproot_support) packed-address type prefixes */
const MODERN = {
  P2PKH: 0x01,
  P2SH: 0x02,
  WITNESS: 0x03,
} as const;

/** Defined base58 version bytes: mainnet P2PKH/P2SH and their testnet counterparts. */
const BASE58_VERSIONS = new Set<number>([VERSION.P2PKH, VERSION.P2SH, 0x6f, 0xc4]);

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
      version: payload[0]!,
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
      if (version === undefined) {
        throw new AddressPackError('Missing bech32 witness version');
      }
      const program = bech32.fromWords(decoded.words.slice(1));
      return { version, program: new Uint8Array(program) };
    } catch {
      // Try bech32m (for witness v1+)
      const decoded = bech32m.decode(address as `${string}1${string}`);
      if (decoded.prefix !== 'bc' && decoded.prefix !== 'tb') {
        throw new AddressPackError('Invalid bech32m prefix');
      }
      const version = decoded.words[0];
      if (version === undefined) {
        throw new AddressPackError('Missing bech32m witness version');
      }
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
 * Pack a Bitcoin address into Counterparty's packed format.
 *
 * Emits the modern (taproot_support) encoding for every address type, because that is what core
 * produces: `lib/utils/address.py::pack` calls the Rust `utils::pack_address` first and only falls
 * back to the legacy packing if that raises, and for any well-formed mainnet address it does not
 * raise. Emitting the legacy form here instead would differ from core's bytes on the first byte
 * alone — caught by the compose oracle, which found exactly that for P2PKH destinations.
 *
 * Legacy packings are still *read* by `unpackAddress`, since they exist in historical messages.
 *
 * @param address - Bitcoin address string (legacy, SegWit, or Taproot)
 * @returns Packed address: 21 bytes for P2PKH/P2SH, 2 + program length for witness programs
 * @throws AddressPackError if the address is invalid or unsupported
 */
export function packAddress(address: string): Uint8Array {
  if (!address || typeof address !== 'string') {
    throw new AddressPackError('Address is required');
  }

  // Witness programs: 0x03, witness version, then the program (counterparty-rs utils.rs).
  if (address.toLowerCase().startsWith('bc1') || address.toLowerCase().startsWith('tb1')) {
    const { version, program } = decodeBech32(address);

    if (program.length !== 20 && program.length !== 32) {
      throw new AddressPackError(`Unsupported witness program length: ${program.length}`);
    }

    const packed = new Uint8Array(2 + program.length);
    packed[0] = MODERN.WITNESS;
    packed[1] = version;
    packed.set(program, 2);
    return packed;
  }

  // Base58: 0x01 for a pubkey hash, 0x02 for a script hash.
  if (address.startsWith('1') || address.startsWith('3') ||
      address.startsWith('m') || address.startsWith('n') || address.startsWith('2')) {
    const { version, hash } = decodeBase58Check(address);

    if (hash.length !== 20) {
      throw new AddressPackError(`Invalid hash length: ${hash.length}`);
    }
    if (!BASE58_VERSIONS.has(version)) {
      throw new AddressPackError(`Unrecognized base58 version byte: 0x${version.toString(16)}`);
    }

    const isScriptHash = version === VERSION.P2SH || version === 0xc4;
    const packed = new Uint8Array(PACKED_ADDRESS_LENGTH);
    packed[0] = isScriptHash ? MODERN.P2SH : MODERN.P2PKH;
    packed.set(hash, 1);
    return packed;
  }

  throw new AddressPackError(`Unsupported address format: ${address}`);
}

/**
 * Pack a Bitcoin address into the **legacy** 21-byte format.
 *
 * MPMA is the one message that still composes with this encoding: core's
 * `mpmaencoding._encode_compress_lut` calls `address.pack_legacy` for every LUT entry, and the
 * decoder reads fixed 21-byte slots. Base58 addresses pack as version byte + 20-byte hash; SegWit
 * v0 packs as `0x80 + witness_version` + the 20-byte program. A 32-byte program does not fit, so
 * Taproot and P2WSH destinations are rejected exactly as core rejects them
 * ("p2wsh still not supported for sending").
 *
 * @throws AddressPackError if the address is invalid or not representable in 21 bytes
 */
export function packAddressLegacy(address: string): Uint8Array {
  if (!address || typeof address !== 'string') {
    throw new AddressPackError('Address is required');
  }

  if (address.toLowerCase().startsWith('bc1') || address.toLowerCase().startsWith('tb1')) {
    const { version, program } = decodeBech32(address);
    if (program.length > 20) {
      throw new AddressPackError('Witness programs over 20 bytes do not fit the legacy packing');
    }
    const packed = new Uint8Array(1 + program.length);
    packed[0] = VERSION.SEGWIT_MARKER + version;
    packed.set(program, 1);
    return packed;
  }

  const { version, hash } = decodeBase58Check(address);
  if (hash.length !== 20) {
    throw new AddressPackError(`Invalid hash length: ${hash.length}`);
  }
  if (!BASE58_VERSIONS.has(version)) {
    throw new AddressPackError(`Unrecognized base58 version byte: 0x${version.toString(16)}`);
  }
  const packed = new Uint8Array(PACKED_ADDRESS_LENGTH);
  packed[0] = version;
  packed.set(hash, 1);
  return packed;
}

/**
 * Unpack a Counterparty packed address (legacy or modern encoding) to a
 * Bitcoin address string.
 *
 * @param packed - Packed address bytes
 * @param network - 'mainnet' or 'testnet' (default: 'mainnet')
 * @returns Bitcoin address string
 * @throws AddressPackError if the packed address is invalid
 */
export function unpackAddress(packed: Uint8Array, network: 'mainnet' | 'testnet' = 'mainnet'): string {
  if (!packed || packed.length === 0) {
    throw new AddressPackError('Empty packed address');
  }

  const firstByte = packed[0]!;
  const rest = packed.slice(1);
  const bech32Prefix = network === 'mainnet' ? 'bc' : 'tb';

  // Modern encoding: type prefix + payload.
  if (firstByte === MODERN.P2PKH && packed.length === PACKED_ADDRESS_LENGTH) {
    return encodeBase58Check(network === 'mainnet' ? 0x00 : 0x6f, rest);
  }
  if (firstByte === MODERN.P2SH && packed.length === PACKED_ADDRESS_LENGTH) {
    return encodeBase58Check(network === 'mainnet' ? 0x05 : 0xc4, rest);
  }
  // Core's unpacker (counterparty-rs utils.rs) requires prefix + version + a program of at
  // least 20 bytes; accepting less would render an address core itself refuses to unpack.
  if (firstByte === MODERN.WITNESS && packed.length >= 22) {
    const witnessVersion = packed[1]!;
    const program = packed.slice(2);
    if (witnessVersion > 16) {
      throw new AddressPackError(`Invalid witness version: ${witnessVersion}`);
    }
    // BIP141 allows up to 40 bytes, but v0 is only defined for 20 (P2WPKH) and 32 (P2WSH), and
    // v1 only for 32 (P2TR). Anything else would render as a plausible address nobody can spend.
    const validForVersion = witnessVersion === 0
      ? program.length === 20 || program.length === 32
      : witnessVersion === 1
        ? program.length === 32
        : program.length <= 40;
    if (!validForVersion) {
      throw new AddressPackError(
        `Invalid witness program length for v${witnessVersion}: ${program.length}`
      );
    }
    return encodeBech32(witnessVersion, program, bech32Prefix);
  }

  // Legacy SegWit marker (0x80 - 0x8F): fixed 21-byte packing, 20-byte program.
  if (firstByte >= VERSION.SEGWIT_MARKER && firstByte <= VERSION.SEGWIT_MARKER + 0x0F) {
    if (packed.length !== PACKED_ADDRESS_LENGTH) {
      throw new AddressPackError(
        `Invalid packed SegWit address length: ${packed.length} (expected ${PACKED_ADDRESS_LENGTH})`
      );
    }
    return encodeBech32(firstByte - VERSION.SEGWIT_MARKER, rest, bech32Prefix);
  }

  // Legacy P2PKH/P2SH: base58 version byte + 20-byte hash.
  if (packed.length !== PACKED_ADDRESS_LENGTH) {
    throw new AddressPackError(`Invalid packed address length: ${packed.length} (expected ${PACKED_ADDRESS_LENGTH})`);
  }
  // The version byte itself carries the network, so accept the four defined values rather than
  // scoping by the `network` argument. Any other leading byte would still base58-encode,
  // producing something that reads as an address and is not one.
  if (!BASE58_VERSIONS.has(firstByte)) {
    throw new AddressPackError(`Unrecognized packed address version byte: 0x${firstByte.toString(16)}`);
  }
  return encodeBase58Check(firstByte, rest);
}

/**
 * Unpack a 21-byte address the way core's `address.unpack_legacy` does — and only that way.
 *
 * The modern type tags (0x01 P2PKH, 0x02 P2SH, 0x03 witness) do not exist in this encoding. Here
 * the leading byte is a base58 *version* byte, except in the 0x80-0x8F range which marks a segwit
 * witness version. That difference is not cosmetic: `0x01 || hash160` is a modern P2PKH tag to
 * {@link unpackAddress} and renders as an ordinary `1…` address, while core base58-encodes it
 * under version 0x01 and credits somewhere else entirely.
 *
 * MPMA is the caller that matters. Core decodes its address lookup table with `unpack_legacy`
 * unconditionally (utils/mpmaencoding.py `_decode_decode_lut`), never the taproot-aware `unpack`,
 * so a table decoded with the modern rules can name a different recipient than the one being paid
 * — and MPMA destinations travel in the payload rather than as outputs, so this string is the only
 * account of them the approval screen has.
 */
export function unpackAddressLegacy(
  packed: Uint8Array,
  network: 'mainnet' | 'testnet' = 'mainnet'
): string {
  if (!packed || packed.length === 0) {
    throw new AddressPackError('Empty packed address');
  }
  if (packed.length !== PACKED_ADDRESS_LENGTH) {
    throw new AddressPackError(
      `Invalid packed address length: ${packed.length} (expected ${PACKED_ADDRESS_LENGTH})`
    );
  }

  const firstByte = packed[0]!;
  const rest = packed.slice(1);

  // Segwit marker: witness version is the offset from 0x80, program is the remaining 20 bytes.
  if (firstByte >= VERSION.SEGWIT_MARKER && firstByte <= VERSION.SEGWIT_MARKER + 0x0F) {
    return encodeBech32(
      firstByte - VERSION.SEGWIT_MARKER,
      rest,
      network === 'mainnet' ? 'bc' : 'tb'
    );
  }

  // Otherwise a base58 version byte. Core would encode any leading byte here; restricting to the
  // four defined versions refuses a payload that reads as an address and is not one, rather than
  // showing the user a plausible string for bytes core will credit elsewhere.
  if (!BASE58_VERSIONS.has(firstByte)) {
    throw new AddressPackError(
      `Unrecognized legacy packed address version byte: 0x${firstByte.toString(16)}`
    );
  }
  return encodeBase58Check(firstByte, rest);
}

/**
 * Check if a packed address represents a SegWit address, in either encoding.
 *
 * Recognizes the modern `0x03` witness prefix as well as the legacy `0x80 + witness version`
 * marker. Checking only the legacy marker would answer "no" for everything `packAddress` now
 * produces, which is a silently wrong answer rather than a failure.
 */
export function isSegwitPacked(packed: Uint8Array): boolean {
  if (packed.length < 1) return false;
  if (packed[0] === MODERN.WITNESS) return packed.length >= 3;
  return packed[0]! >= VERSION.SEGWIT_MARKER && packed[0]! <= VERSION.SEGWIT_MARKER + 0x0F;
}

/**
 * Get the witness version from a packed SegWit address, in either encoding.
 * Returns -1 if not a SegWit address.
 */
export function getWitnessVersion(packed: Uint8Array): number {
  if (!isSegwitPacked(packed)) return -1;
  if (packed[0] === MODERN.WITNESS) return packed[1]!;
  return packed[0]! - VERSION.SEGWIT_MARKER;
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
