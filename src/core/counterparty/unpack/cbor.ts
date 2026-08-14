export type CborValue =
  | bigint
  | number
  | boolean
  | string
  | Uint8Array
  | CborValue[]
  | Map<CborValue, CborValue>
  | null;

interface DecodedValue {
  value: CborValue;
  offset: number;
}

function readLength(data: Uint8Array, offset: number, additionalInfo: number): [bigint, number] {
  if (additionalInfo < 24) return [BigInt(additionalInfo), offset];

  const byteCount = additionalInfo === 24 ? 1 : additionalInfo === 25 ? 2 : additionalInfo === 26 ? 4 : 8;
  if (![24, 25, 26, 27].includes(additionalInfo) || offset + byteCount > data.length) {
    throw new Error('Invalid CBOR length');
  }

  let value = 0n;
  for (let index = 0; index < byteCount; index += 1) {
    value = (value << 8n) | BigInt(data[offset + index]!);
  }
  return [value, offset + byteCount];
}

function toSafeLength(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR value is too large');
  return Number(value);
}

function decodeFloat16(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

/** Counterparty messages are flat arrays; a deep payload is malformed, not merely unusual. */
const MAX_CBOR_DEPTH = 16;

function decodeValue(data: Uint8Array, offset: number, depth = 0): DecodedValue {
  if (depth > MAX_CBOR_DEPTH) throw new Error('CBOR nesting too deep');
  if (offset >= data.length) throw new Error('Unexpected end of CBOR data');

  const initial = data[offset]!;
  const majorType = initial >> 5;
  const additionalInfo = initial & 0x1f;
  const [length, valueOffset] = readLength(data, offset + 1, additionalInfo);

  if (majorType === 0) return { value: length, offset: valueOffset };
  if (majorType === 1) return { value: -1n - length, offset: valueOffset };

  if (majorType === 2 || majorType === 3) {
    const byteLength = toSafeLength(length);
    const end = valueOffset + byteLength;
    if (end > data.length) throw new Error('Unexpected end of CBOR data');
    const bytes = data.slice(valueOffset, end);
    return {
      value: majorType === 2 ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      offset: end,
    };
  }

  if (majorType === 4) {
    const values: CborValue[] = [];
    const itemCount = toSafeLength(length);
    let itemOffset = valueOffset;
    for (let index = 0; index < itemCount; index += 1) {
      const decoded = decodeValue(data, itemOffset, depth + 1);
      values.push(decoded.value);
      itemOffset = decoded.offset;
    }
    return { value: values, offset: itemOffset };
  }

  // Maps never occur in Counterparty messages themselves (those are flat arrays), but ord
  // inscription metadata may be a map carrying the message array under an "xcp" key — core's
  // parser accepts that shape (`extract_data_from_witness`, gated by `ordinals_metadata_support`).
  // Duplicate keys resolve last-write-wins, matching serde_cbor's BTreeMap for the primitive keys
  // that can actually collide here.
  if (majorType === 5) {
    const entries = new Map<CborValue, CborValue>();
    const itemCount = toSafeLength(length);
    let itemOffset = valueOffset;
    for (let index = 0; index < itemCount; index += 1) {
      const key = decodeValue(data, itemOffset, depth + 1);
      const value = decodeValue(data, key.offset, depth + 1);
      entries.set(key.value, value.value);
      itemOffset = value.offset;
    }
    return { value: entries, offset: itemOffset };
  }

  if (majorType === 7 && additionalInfo === 20) return { value: false, offset: offset + 1 };
  if (majorType === 7 && additionalInfo === 21) return { value: true, offset: offset + 1 };
  if (majorType === 7 && additionalInfo === 22) return { value: null, offset: offset + 1 };

  // Floats: additionalInfo 25/26/27 = half/single/double precision.
  // readLength already consumed the raw big-endian bits into `length`.
  if (majorType === 7 && additionalInfo === 25) {
    return { value: decodeFloat16(Number(length)), offset: valueOffset };
  }
  if (majorType === 7 && additionalInfo === 26) {
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, Number(length), false);
    return { value: view.getFloat32(0, false), offset: valueOffset };
  }
  if (majorType === 7 && additionalInfo === 27) {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, length, false);
    return { value: view.getFloat64(0, false), offset: valueOffset };
  }

  throw new Error(`Unsupported CBOR type ${majorType}`);
}

export function decodeCbor(data: Uint8Array): CborValue {
  const decoded = decodeValue(data, 0);
  if (decoded.offset !== data.length) throw new Error('Unexpected trailing CBOR data');
  return decoded.value;
}

/**
 * Decode a payload expected to be a definite-length CBOR array of exactly `arity` elements — the
 * shape of every taproot_support-era Counterparty message. Returns the elements, or null when the
 * payload is not such an array, so message unpackers can fall back to legacy struct parsing.
 */
export function tryDecodeCborArray(payload: Uint8Array, arity: number): CborValue[] | null {
  // Definite-length array header (major type 4); anything else is not a modern message.
  if (payload.length < 2 || (payload[0]! & 0xe0) !== 0x80) return null;

  let decoded: CborValue;
  try {
    decoded = decodeCbor(payload);
  } catch {
    return null;
  }
  return Array.isArray(decoded) && decoded.length === arity ? decoded : null;
}
