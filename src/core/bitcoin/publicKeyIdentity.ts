import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Point } from '@noble/secp256k1';
import {
  AddressFormat,
  encodeAddress,
  normalizeAddressForComparison,
} from '@/core/bitcoin/address';

export type SecPublicKeyEncoding = 'compressed' | 'uncompressed';

export interface SecPublicKeyIdentity {
  /** Exact SEC bytes. This encoding is part of a P2PKH address's identity. */
  bytes: Uint8Array;
  hex: string;
  encoding: SecPublicKeyEncoding;
  /** Canonical compressed encoding for comparisons that ask only whether the EC point is equal. */
  pointId: string;
}

/** Parse and validate one exact compressed or uncompressed SEC public-key serialization. */
export function parseSecPublicKey(value: string): SecPublicKeyIdentity | null {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value)) return null;
  const normalized = value.toLowerCase();
  const isCompressed = normalized.length === 66 && /^(02|03)/.test(normalized);
  const isUncompressed = normalized.length === 130 && normalized.startsWith('04');
  if (!isCompressed && !isUncompressed) return null;

  try {
    const bytes = hexToBytes(normalized);
    const point = Point.fromBytes(bytes);
    return {
      bytes,
      hex: normalized,
      encoding: isCompressed ? 'compressed' : 'uncompressed',
      pointId: bytesToHex(point.toBytes(true)),
    };
  } catch {
    return null;
  }
}

/** EC-point identity for capability checks such as "can this private key recover the output?". */
export function publicKeyPointId(value: string): string | null {
  return parseSecPublicKey(value)?.pointId ?? null;
}

/**
 * Exact address binding for identity checks. Unlike point equality, compressed and uncompressed
 * P2PKH serializations deliberately produce different addresses.
 */
export function publicKeyMatchesAddress(value: string, address: string): boolean {
  const parsed = parseSecPublicKey(value);
  if (!parsed || !address) return false;

  const formats: AddressFormat[] = parsed.encoding === 'compressed'
    ? [AddressFormat.P2PKH, AddressFormat.P2WPKH, AddressFormat.P2SH_P2WPKH, AddressFormat.P2TR]
    : [AddressFormat.P2PKH];

  return formats.some((format) => {
    try {
      return normalizeAddressForComparison(encodeAddress(parsed.bytes, format))
        === normalizeAddressForComparison(address);
    } catch {
      return false;
    }
  });
}
