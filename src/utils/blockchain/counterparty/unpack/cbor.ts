export type CborValue = bigint | boolean | string | Uint8Array | CborValue[] | null;

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
    value = (value << 8n) | BigInt(data[offset + index]);
  }
  return [value, offset + byteCount];
}

function toSafeLength(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR value is too large');
  return Number(value);
}

function decodeValue(data: Uint8Array, offset: number): DecodedValue {
  if (offset >= data.length) throw new Error('Unexpected end of CBOR data');

  const initial = data[offset];
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
    let itemOffset = valueOffset;
    for (let index = 0; index < toSafeLength(length); index += 1) {
      const decoded = decodeValue(data, itemOffset);
      values.push(decoded.value);
      itemOffset = decoded.offset;
    }
    return { value: values, offset: itemOffset };
  }

  if (majorType === 7 && additionalInfo === 20) return { value: false, offset: offset + 1 };
  if (majorType === 7 && additionalInfo === 21) return { value: true, offset: offset + 1 };
  if (majorType === 7 && additionalInfo === 22) return { value: null, offset: offset + 1 };

  throw new Error(`Unsupported CBOR type ${majorType}`);
}

export function decodeCbor(data: Uint8Array): CborValue {
  const decoded = decodeValue(data, 0);
  if (decoded.offset !== data.length) throw new Error('Unexpected trailing CBOR data');
  return decoded.value;
}
