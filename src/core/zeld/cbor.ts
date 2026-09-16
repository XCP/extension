/**
 * The corner of CBOR (RFC 8949) the ZELD protocol reads: an array of unsigned integers.
 *
 * A distribution OP_RETURN is `ZELD` followed by CBOR `[amount for output 0, amount for output
 * 1, ...]` over the non-OP_RETURN outputs in order. The indexer decodes it with a general CBOR
 * library, so the encoding here must be canonical: the shortest header for each value.
 */

const ZELD_PREFIX = new Uint8Array([0x5a, 0x45, 0x4c, 0x44]); // "ZELD"

function header(majorType: number, value: bigint): number[] {
  const type = majorType << 5;
  if (value < 24n) return [type | Number(value)];
  if (value < 0x100n) return [type | 24, Number(value)];
  if (value < 0x1_0000n) return [type | 25, Number(value >> 8n), Number(value & 0xffn)];
  if (value < 0x1_0000_0000n) {
    return [type | 26, ...[24n, 16n, 8n, 0n].map(shift => Number((value >> shift) & 0xffn))];
  }
  if (value < 0x1_0000_0000_0000_0000n) {
    return [type | 27, ...[56n, 48n, 40n, 32n, 24n, 16n, 8n, 0n].map(shift => Number((value >> shift) & 0xffn))];
  }
  throw new RangeError('CBOR unsigned integer exceeds 64 bits');
}

export function encodeCborUint(value: bigint): Uint8Array {
  if (value < 0n) throw new RangeError('CBOR unsigned integer cannot be negative');
  return Uint8Array.from(header(0, value));
}

export function encodeCborUintArray(values: readonly bigint[]): Uint8Array {
  const bytes = header(4, BigInt(values.length));
  for (const value of values) bytes.push(...encodeCborUint(value));
  return Uint8Array.from(bytes);
}

/** Decode what `encodeCborUintArray` produces; used by tests and by nothing on a signing path. */
export function decodeCborUintArray(bytes: Uint8Array): bigint[] {
  let position = 0;
  const readUint = (): bigint => {
    const initial = bytes[position++];
    if (initial === undefined) throw new RangeError('truncated CBOR');
    const info = initial & 0x1f;
    if (info < 24) return BigInt(info);
    const length = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : -1;
    if (length < 0) throw new RangeError('unsupported CBOR integer encoding');
    let value = 0n;
    for (let i = 0; i < length; i++) {
      const byte = bytes[position++];
      if (byte === undefined) throw new RangeError('truncated CBOR');
      value = (value << 8n) | BigInt(byte);
    }
    return value;
  };
  const first = bytes[position];
  if (first === undefined || first >> 5 !== 4) throw new RangeError('expected a CBOR array');
  const count = readUint();
  const values: bigint[] = [];
  for (let i = 0n; i < count; i++) {
    const next = bytes[position];
    if (next === undefined || next >> 5 !== 0) throw new RangeError('expected a CBOR unsigned integer');
    values.push(readUint());
  }
  return values;
}

/**
 * The OP_RETURN script that tells the ZELD protocol how to split the carried-in ZELD across the
 * transaction's non-OP_RETURN outputs, in order. Any output not listed receives 0; an unspent
 * remainder goes to output 0; a request larger than what the inputs carry is ignored and
 * everything goes to output 0. Layouts in this wallet put the wallet's own change at output 0 so
 * every failure mode keeps the ZELD.
 */
export function zeldDistributionScript(amounts: readonly bigint[]): Uint8Array {
  const payload = new Uint8Array([...ZELD_PREFIX, ...encodeCborUintArray(amounts)]);
  if (payload.length > 75) throw new RangeError('ZELD distribution payload too long for a single push');
  return new Uint8Array([0x6a, payload.length, ...payload]);
}
