/**
 * MPMA (Multi-Party Multi-Asset) Send Message Unpacker
 *
 * Message ID: 3
 *
 * This is a complex bit-packed format that allows sending multiple assets
 * to multiple recipients in a single transaction.
 *
 * Format:
 * 1. Address LUT (Lookup Table):
 *    - 2 bytes: Number of addresses (uint16 big-endian)
 *    - 21 bytes × N: Packed addresses
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

import { unpackAddress, PACKED_ADDRESS_LENGTH } from '../address';
import { assetIdToName } from '../assetId';

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

    const bit = (this.data[this.bytePos] >> (7 - this.bitPos)) & 1;
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
 * Decode the address lookup table from MPMA data
 */
function decodeLUT(
  data: Uint8Array
): { addresses: string[]; nbits: number; remaining: Uint8Array } {
  if (data.length < 2) {
    throw new Error('MPMA data too short for LUT header');
  }

  // Read number of addresses (2 bytes big-endian)
  const numAddresses = (data[0] << 8) | data[1];

  if (numAddresses === 0) {
    throw new Error('MPMA address list cannot be empty');
  }

  const bytesPerAddress = PACKED_ADDRESS_LENGTH; // 21
  const lutSize = 2 + numAddresses * bytesPerAddress;

  if (data.length < lutSize) {
    throw new Error(`MPMA data too short for ${numAddresses} addresses`);
  }

  // Decode addresses
  const addresses: string[] = [];
  let pos = 2;
  for (let i = 0; i < numAddresses; i++) {
    const packedAddr = data.slice(pos, pos + bytesPerAddress);
    // Detect network from first address byte
    const network = packedAddr[0] === 0x6f || packedAddr[0] === 0xc4 ? 'testnet' : 'mainnet';
    addresses.push(unpackAddress(packedAddr, network));
    pos += bytesPerAddress;
  }

  // Calculate nbits (bits needed to index addresses)
  const nbits = numAddresses > 1 ? Math.ceil(Math.log2(numAddresses)) : 0;

  return {
    addresses,
    nbits,
    remaining: data.slice(lutSize),
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
  const { addresses, nbits, remaining } = decodeLUT(payload);

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
        destination: addresses[addrIndex],
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
  };
}
