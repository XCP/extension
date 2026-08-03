/**
 * CBOR encoder producing the exact bytes counterparty-core emits.
 *
 * The mirror of `unpack/cbor.ts`. Core encodes every composed message with `cbor2.dumps`, so this
 * has to match that library's canonical choices, not merely produce *valid* CBOR — the output is
 * compared byte-for-byte against a composed transaction, so a different-but-equivalent encoding of
 * the same value is a failure. Specifically:
 *
 *   - integers use the shortest head that fits (cbor2's default),
 *   - byte strings and text strings carry a definite length,
 *   - arrays are definite-length,
 *   - `None` encodes as `null` (0xf6), and booleans as 0xf4 / 0xf5,
 *   - floats are always 8-byte doubles (0xfb).
 *
 * The float choice is cbor2's default, not its canonical mode: `dumps` with no options emits every
 * finite float as a big-endian float64, and canonical mode (which shortens to float16/32 when
 * lossless) is something core never enables. Verified empirically against cbor2 5.9.0, the version
 * core pins. Core emits floats only for a broadcast's value. Non-finite floats are refused — core's
 * compose rejects them before packing, so bytes for them have no meaning here.
 *
 * A JavaScript `number` therefore always encodes as a float, even when integral: integers must be
 * passed as `bigint`, which is what keeps 1 and 1.0 — different bytes on the wire — distinct.
 */

export type CborEncodable =
  | bigint
  | number
  | boolean
  | string
  | Uint8Array
  | null
  | CborEncodable[];

/** Encode a major type and its argument using the shortest head that fits, as cbor2 does. */
function encodeHead(majorType: number, value: bigint): number[] {
  const base = majorType << 5;
  if (value < 0n) throw new Error('CBOR: negative lengths and integers are not emitted by core');
  if (value < 24n) return [base | Number(value)];
  if (value < 0x100n) return [base | 24, Number(value)];
  if (value < 0x10000n) return [base | 25, Number(value >> 8n), Number(value & 0xffn)];
  if (value < 0x100000000n) {
    return [base | 26, ...[24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn))];
  }
  if (value < 0x10000000000000000n) {
    return [
      base | 27,
      ...[56n, 48n, 40n, 32n, 24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)),
    ];
  }
  throw new Error('CBOR: value exceeds 64 bits');
}

function encodeValue(value: CborEncodable): number[] {
  if (value === null) return [0xf6];
  if (value === false) return [0xf4];
  if (value === true) return [0xf5];
  if (typeof value === 'bigint') return encodeHead(0, value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CBOR: non-finite floats are rejected by core');
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, false);
    return [0xfb, ...bytes];
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return [...encodeHead(3, BigInt(bytes.length)), ...bytes];
  }
  if (value instanceof Uint8Array) {
    return [...encodeHead(2, BigInt(value.length)), ...value];
  }
  if (Array.isArray(value)) {
    return [
      ...encodeHead(4, BigInt(value.length)),
      ...value.flatMap((item) => encodeValue(item)),
    ];
  }
  throw new Error('CBOR: unsupported value type');
}

/** Encode a value to the bytes counterparty-core's `cbor2.dumps` would produce. */
export function encodeCbor(value: CborEncodable): Uint8Array {
  return new Uint8Array(encodeValue(value));
}
