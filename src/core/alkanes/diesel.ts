/**
 * Minimal, dependency-free encoding for the DIESEL mint protostone.
 *
 * This module deliberately does not decide whether a mint is currently valid or economical. The
 * deployed genesis alkane can change those rules. It only makes the bytes reviewable and testable
 * instead of scattering a frozen mainnet constant through transaction construction code.
 */

export const ALKANES_PROTOCOL_TAG = 1n;
export const DIESEL_ALKANE_ID = { block: 2n, tx: 0n } as const;
export const DIESEL_MINT_OPCODE = 77n;
export const DIESEL_CARRIER_SATS = 330;
/** One P2WPKH storage output (31 vB) plus the 17-byte runestone output (26 vB). */
export const DIESEL_MINT_MARGINAL_VBYTES = 57;

const RUNESTONE_PROTOCOL_TAG = 16_383n;
const PROTOSTONE_POINTER_TAG = 91n;
const PROTOSTONE_REFUND_TAG = 93n;
const PROTOSTONE_MESSAGE_TAG = 81n;
const PROTOSTONE_BODY_TAG = 0n;
const OP_RETURN = 0x6a;
const OP_PUSHNUM_13 = 0x5d;

function encodeUleb128(value: bigint): number[] {
  if (value < 0n) throw new Error('ULEB128 cannot encode a negative integer');
  const bytes: number[] = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (value > 0n);
  return bytes;
}

function decodeUleb128(bytes: Uint8Array, start = 0): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  for (let offset = start; offset < bytes.length; offset++) {
    const byte = bytes[offset];
    if (byte === undefined) break;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: offset + 1 };
    shift += 7n;
    if (shift >= 128n) throw new Error('ULEB128 value exceeds u128');
  }
  throw new Error('Truncated ULEB128 value');
}

function bytesToU128(bytes: number[]): bigint {
  if (bytes.length > 15) {
    throw new Error('A protostone field group may contain at most 15 packed bytes');
  }
  return bytes.reduce(
    (value, byte, index) => value | (BigInt(byte) << (8n * BigInt(index))),
    0n,
  );
}

function u128ToBytes(value: bigint): number[] {
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Expected even-length hexadecimal');
  return Uint8Array.from(hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function bytesToHex(bytes: Iterable<number>): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Build the complete zero-value OP_RETURN script for one DIESEL mint call. */
export function buildDieselMintScript(pointer: number, refund = pointer): string {
  if (!Number.isSafeInteger(pointer) || pointer < 0) throw new Error('Invalid DIESEL output pointer');
  if (!Number.isSafeInteger(refund) || refund < 0) throw new Error('Invalid DIESEL refund pointer');

  // Message values are packed into one u128 using the 15-byte groups defined by protorune. The
  // final message value itself contains calldata [alkane block, alkane tx, opcode].
  const calldata = bytesToU128([
    ...encodeUleb128(DIESEL_ALKANE_ID.block),
    ...encodeUleb128(DIESEL_ALKANE_ID.tx),
    ...encodeUleb128(DIESEL_MINT_OPCODE),
  ]);
  const fields = [
    ALKANES_PROTOCOL_TAG,
    6n,
    PROTOSTONE_POINTER_TAG,
    BigInt(pointer),
    PROTOSTONE_REFUND_TAG,
    BigInt(refund),
    PROTOSTONE_MESSAGE_TAG,
    calldata,
  ];
  const packed = bytesToU128(fields.flatMap(encodeUleb128));
  const payload = [...encodeUleb128(RUNESTONE_PROTOCOL_TAG), ...encodeUleb128(packed)];
  if (payload.length > 75) throw new Error('DIESEL protostone requires a non-minimal push');
  return bytesToHex([OP_RETURN, OP_PUSHNUM_13, payload.length, ...payload]);
}

/** Route an exact amount to one output and every remaining input unit to our carrier output. */
export function buildDieselTransferScript(
  amountBaseUnits: bigint,
  recipientOutput: number,
  remainderOutput: number,
): string {
  if (amountBaseUnits <= 0n) throw new Error('DIESEL transfer amount must be positive');
  if (!Number.isSafeInteger(recipientOutput) || recipientOutput < 0) {
    throw new Error('Invalid DIESEL recipient output');
  }
  if (!Number.isSafeInteger(remainderOutput) || remainderOutput < 0) {
    throw new Error('Invalid DIESEL remainder output');
  }
  // The single edict is delta-encoded from 0:0 to DIESEL 2:0. After it allocates the requested
  // units, protorune sends the unallocated input balance to ProtoPointer.
  const fields = [
    ALKANES_PROTOCOL_TAG,
    7n,
    PROTOSTONE_POINTER_TAG,
    BigInt(remainderOutput),
    PROTOSTONE_BODY_TAG,
    DIESEL_ALKANE_ID.block,
    DIESEL_ALKANE_ID.tx,
    amountBaseUnits,
    BigInt(recipientOutput),
  ];
  const fieldBytes = fields.flatMap(encodeUleb128);
  if (fieldBytes.length > 15) {
    throw new Error('DIESEL transfer amount requires multi-word protostone encoding');
  }
  const packed = bytesToU128(fieldBytes);
  const payload = [...encodeUleb128(RUNESTONE_PROTOCOL_TAG), ...encodeUleb128(packed)];
  if (payload.length > 75) throw new Error('DIESEL transfer requires a non-minimal push');
  return bytesToHex([OP_RETURN, OP_PUSHNUM_13, payload.length, ...payload]);
}

export interface DecodedDieselMintScript {
  pointer: number;
  refund: number;
  calldata: readonly [2n, 0n, 77n];
}

export function isVerifiedDieselCarrierAddress(address: string): boolean {
  // The regtest and package-cost proof cover native v0 P2WPKH. Do not broaden this merely because
  // another address kind can be encoded; routing and lifetime spendability need their own proof.
  return /^(?:bc|tb)1q[02-9ac-hj-np-z]{38}$/i.test(address)
    || /^bcrt1q[02-9ac-hj-np-z]{38,58}$/i.test(address);
}

/** Strictly decode a script produced by {@link buildDieselMintScript}. */
export function decodeDieselMintScript(scriptHex: string): DecodedDieselMintScript {
  const script = hexToBytes(scriptHex);
  if (script[0] !== OP_RETURN || script[1] !== OP_PUSHNUM_13) {
    throw new Error('Not an Alkanes runestone OP_RETURN');
  }
  const payloadLength = script[2];
  if (payloadLength === undefined || payloadLength !== script.length - 3) {
    throw new Error('Invalid runestone payload length');
  }
  const protocol = decodeUleb128(script, 3);
  if (protocol.value !== RUNESTONE_PROTOCOL_TAG) throw new Error('Missing protostone protocol tag');
  const packed = decodeUleb128(script, protocol.next);
  if (packed.next !== script.length) throw new Error('Unexpected trailing runestone data');

  const fieldsBytes = Uint8Array.from(u128ToBytes(packed.value));
  const fields: bigint[] = [];
  for (let offset = 0; offset < fieldsBytes.length;) {
    const decoded = decodeUleb128(fieldsBytes, offset);
    fields.push(decoded.value);
    offset = decoded.next;
  }
  if (
    fields.length !== 8
    || fields[0] !== ALKANES_PROTOCOL_TAG
    || fields[1] !== 6n
    || fields[2] !== PROTOSTONE_POINTER_TAG
    || fields[4] !== PROTOSTONE_REFUND_TAG
    || fields[6] !== PROTOSTONE_MESSAGE_TAG
  ) {
    throw new Error('Unexpected DIESEL protostone fields');
  }

  const calldataBytes = Uint8Array.from(u128ToBytes(fields[7] ?? 0n));
  const calldata: bigint[] = [];
  for (let offset = 0; offset < calldataBytes.length;) {
    const decoded = decodeUleb128(calldataBytes, offset);
    calldata.push(decoded.value);
    offset = decoded.next;
  }
  if (
    calldata.length !== 3
    || calldata[0] !== DIESEL_ALKANE_ID.block
    || calldata[1] !== DIESEL_ALKANE_ID.tx
    || calldata[2] !== DIESEL_MINT_OPCODE
  ) {
    throw new Error('Unexpected DIESEL mint calldata');
  }

  const pointer = Number(fields[3]);
  const refund = Number(fields[5]);
  if (!Number.isSafeInteger(pointer) || !Number.isSafeInteger(refund)) {
    throw new Error('DIESEL output pointer is too large');
  }
  return { pointer, refund, calldata: [2n, 0n, 77n] };
}
