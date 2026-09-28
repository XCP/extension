/**
 * MPMA (Multi-Party Multi-Asset) Send Message Unpacker
 *
 * Message ID: 3
 *
 * This is a complex bit-packed format that allows sending multiple assets
 * to multiple recipients in a single transaction.
 *
 * Format:
 * 1. Address LUT (Lookup Table), in one of two layouts (see `mpmaTableFormat.ts`):
 *    - 2 bytes: Number of addresses (uint16 big-endian)
 *    - legacy (before `mpma_taproot_support`): 21 bytes × N, `address.pack_legacy`
 *    - length-prefixed (from `mpma_taproot_support`): per address, a length byte and that many
 *      bytes of the modern packing (`0x01`/`0x02` + hash, or `0x03` + witness version + program)
 *
 * 2. Bit-packed send data:
 *    - Global memo (optional): 1 bit exists flag, if true: 1 bit is_hex, 6 bits length, data
 *    - For each asset group (while "more" flag is 1):
 *      - 1 bit: more sends flag
 *      - 64 bits: asset_id
 *      - nbits: number of recipients - 1 (nbits = ceil(log2(num_addresses)))
 *      - For each recipient:
 *        - nbits: address index in LUT
 *        - 64 bits: amount
 *        - Memo (optional): 1 bit exists, if true: 1 bit is_hex, 6 bits length, data
 *    - Final 0 bit signals end
 */

import type { MpmaTableFormat } from '@/core/counterparty/mpmaTableFormat';
import { PACKED_ADDRESS_LENGTH, unpackAddressLegacy, unpackAddressModern } from '@/core/counterparty/unpack/address';
import { assetIdToName } from '@/core/counterparty/unpack/assetId';

/**
 * Single send within an MPMA transaction
 */
export interface MPMASend {
  /** Asset name */
  asset: string;
  /** Destination address */
  destination: string;
  /** Quantity to send */
  quantity: bigint;
  /** Optional memo */
  memo?: string;
  /** Whether memo is hex-encoded */
  memoIsHex?: boolean;
}

/**
 * Unpacked MPMA Send data
 */
export interface MPMAData {
  /** All sends in this MPMA transaction */
  sends: MPMASend[];
  /** Global memo (applies to all sends without individual memos) */
  globalMemo?: string;
  /** Whether global memo is hex-encoded */
  globalMemoIsHex?: boolean;
  /**
   * Which address table the bytes carry. Core reads exactly one of them at any height, so a
   * caller that knows the height the message will be parsed at holds this to it
   * (`resolveMpmaTableFormat`); the recipients above are only what core credits when it matches.
   */
  tableFormat: MpmaTableFormat;
}

/**
 * Bit reader for parsing bit-packed data
 */
class BitReader {
  private data: Uint8Array;
  private bytePos: number = 0;
  private bitPos: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /**
   * Read a single bit
   */
  readBit(): boolean {
    if (this.bytePos >= this.data.length) {
      throw new Error('BitReader: out of data');
    }

    const bit = (this.data[this.bytePos]! >> (7 - this.bitPos)) & 1;
    this.bitPos++;
    if (this.bitPos >= 8) {
      this.bitPos = 0;
      this.bytePos++;
    }
    return bit === 1;
  }

  /**
   * Read multiple bits as an unsigned integer
   */
  readBits(count: number): number {
    if (count > 32) {
      throw new Error('BitReader: cannot read more than 32 bits at once');
    }

    let value = 0;
    for (let i = 0; i < count; i++) {
      value = (value << 1) | (this.readBit() ? 1 : 0);
    }
    return value;
  }

  /**
   * Read 64 bits as a BigInt (big-endian)
   */
  readUint64BE(): bigint {
    let value = 0n;
    for (let i = 0; i < 64; i++) {
      value = (value << 1n) | (this.readBit() ? 1n : 0n);
    }
    return value;
  }

  /**
   * Read bytes
   */
  readBytes(count: number): Uint8Array {
    const result = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = this.readBits(8);
    }
    return result;
  }
}

/**
 * First bytes a legacy table entry can start with, as `unpackAddressLegacy` accepts them: the
 * four base58 version bytes and the segwit marker range. A length-prefixed entry starts with its
 * length, 21 to 42, which is none of these — so the first entry says which table this is.
 */
function isLegacyEntryStart(byte: number): boolean {
  return byte === 0x00 || byte === 0x05 || byte === 0x6f || byte === 0xc4 || (byte >= 0x80 && byte <= 0x8f);
}

/** Legacy table: fixed 21-byte `pack_legacy` entries (core `_decode_decode_lut`, pre-activation). */
function decodeLegacyEntries(data: Uint8Array, numAddresses: number): { addresses: string[]; end: number } {
  const bytesPerAddress = PACKED_ADDRESS_LENGTH; // 21
  const end = 2 + numAddresses * bytesPerAddress;

  if (data.length < end) {
    throw new Error(`MPMA data too short for ${numAddresses} addresses`);
  }

  const addresses: string[] = [];
  let pos = 2;
  for (let i = 0; i < numAddresses; i++) {
    const packedAddr = data.slice(pos, pos + bytesPerAddress);
    // Detect network from first address byte
    const network = packedAddr[0] === 0x6f || packedAddr[0] === 0xc4 ? 'testnet' : 'mainnet';
    // Legacy rules only: in this table core decodes with `address.unpack_legacy`, never the
    // taproot-aware `unpack`. Under the modern rules a leading 0x01 is a P2PKH type tag and renders
    // an ordinary `1…` address, while core reads it as a base58 version byte and credits a
    // different one — and an MPMA's recipients are carried in the payload, so this string is all
    // the approval screen has.
    addresses.push(unpackAddressLegacy(packedAddr, network));
    pos += bytesPerAddress;
  }
  return { addresses, end };
}

/**
 * Length-prefixed table (core `_decode_decode_lut` under `mpma_taproot_support`): each entry is a
 * length byte and that many bytes of the modern packing, read with the modern rules alone, as
 * core's Rust unpacker reads them. An empty or truncated entry is refused rather than read out of
 * the bytes that follow it.
 */
function decodeLengthPrefixedEntries(data: Uint8Array, numAddresses: number): { addresses: string[]; end: number } {
  const addresses: string[] = [];
  let pos = 2;
  for (let i = 0; i < numAddresses; i++) {
    if (pos >= data.length) {
      throw new Error(`MPMA data too short for ${numAddresses} addresses`);
    }
    const length = data[pos]!;
    pos += 1;
    if (length === 0) {
      throw new Error('MPMA address cannot be empty');
    }
    if (pos + length > data.length) {
      throw new Error('MPMA address list is truncated');
    }
    addresses.push(unpackAddressModern(data.slice(pos, pos + length)));
    pos += length;
  }
  return { addresses, end: pos };
}

/**
 * Decode the address lookup table from MPMA data
 */
function decodeLUT(
  data: Uint8Array
): { addresses: string[]; nbits: number; remaining: Uint8Array; tableFormat: MpmaTableFormat } {
  if (data.length < 2) {
    throw new Error('MPMA data too short for LUT header');
  }

  // Read number of addresses (2 bytes big-endian)
  const numAddresses = (data[0]! << 8) | data[1]!;

  if (numAddresses === 0) {
    throw new Error('MPMA address list cannot be empty');
  }
  if (data.length < 3) {
    throw new Error(`MPMA data too short for ${numAddresses} addresses`);
  }

  const tableFormat: MpmaTableFormat = isLegacyEntryStart(data[2]!) ? 'legacy' : 'length-prefixed';
  const { addresses, end } = tableFormat === 'legacy'
    ? decodeLegacyEntries(data, numAddresses)
    : decodeLengthPrefixedEntries(data, numAddresses);

  // Calculate nbits (bits needed to index addresses)
  const nbits = numAddresses > 1 ? Math.ceil(Math.log2(numAddresses)) : 0;

  return {
    addresses,
    nbits,
    remaining: data.slice(end),
    tableFormat,
  };
}

/**
 * Decode a memo from the bit stream
 */
function decodeMemo(reader: BitReader): { memo: string; isHex: boolean } | null {
  // First bit: memo exists?
  if (!reader.readBit()) {
    return null;
  }

  // Second bit: is hex?
  const isHex = reader.readBit();

  // 6 bits: length
  const length = reader.readBits(6);

  if (length === 0) {
    return { memo: '', isHex };
  }

  // Read memo bytes
  const memoBytes = reader.readBytes(length);

  if (isHex) {
    // Return hex string
    return {
      memo: Array.from(memoBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      isHex: true,
    };
  } else {
    // Return UTF-8 string
    return {
      memo: new TextDecoder('utf-8').decode(memoBytes),
      isHex: false,
    };
  }
}

/**
 * Unpack an MPMA Send message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked MPMA data
 * @throws Error if payload is invalid
 */
export function unpackMPMA(payload: Uint8Array): MPMAData {
  if (payload.length < 3) {
    throw new Error('MPMA payload too short');
  }

  // Decode the address lookup table
  const { addresses, nbits, remaining, tableFormat } = decodeLUT(payload);

  // Create bit reader for remaining data
  const reader = new BitReader(remaining);

  // Read global memo (optional)
  const globalMemoResult = decodeMemo(reader);
  const globalMemo = globalMemoResult?.memo;
  const globalMemoIsHex = globalMemoResult?.isHex;

  // Read send groups
  const sends: MPMASend[] = [];

  // While "more sends" flag is 1
  while (reader.readBit()) {
    // Read asset ID (64 bits)
    const assetId = reader.readUint64BE();
    const asset = assetIdToName(assetId);

    // Read number of recipients - 1
    const numRecipients = nbits > 0 ? reader.readBits(nbits) + 1 : 1;

    // Read each recipient
    for (let i = 0; i < numRecipients; i++) {
      // Read address index
      const addrIndex = nbits > 0 ? reader.readBits(nbits) : 0;

      if (addrIndex >= addresses.length) {
        throw new Error(`MPMA address index ${addrIndex} out of bounds`);
      }

      // Read amount (64 bits)
      const quantity = reader.readUint64BE();

      // Read per-send memo (optional)
      const sendMemoResult = decodeMemo(reader);

      const send: MPMASend = {
        asset,
        destination: addresses[addrIndex]!,
        quantity,
      };

      // Apply memo (per-send takes precedence over global)
      if (sendMemoResult) {
        send.memo = sendMemoResult.memo;
        send.memoIsHex = sendMemoResult.isHex;
      } else if (globalMemo !== undefined) {
        send.memo = globalMemo;
        send.memoIsHex = globalMemoIsHex;
      }

      sends.push(send);
    }
  }

  return {
    sends,
    globalMemo,
    globalMemoIsHex,
    tableFormat,
  };
}
