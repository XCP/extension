/**
 * Local construction of the Counterparty message bytes a compose request should produce, so
 * verification can be a single byte comparison instead of a field-by-field walk (ADR-019, see
 * `unpack/verify.ts`).
 *
 * Field order and encoding follow core's compose functions exactly, since the output is compared
 * byte-for-byte. Only the taproot_support (CBOR-era) encoding is produced: protocol features
 * activate at a block height and never turn off, so every present-day compose uses it.
 *
 * A type that cannot be packed yields `null`, which the caller treats as "cannot verify by
 * equality" — never as agreement.
 */

import { isTextualMimeType } from '@/core/counterparty/inscriptionEnvelope';
import { type CborEncodable, encodeCbor } from '@/core/counterparty/pack/cbor';
import { packAddress, packAddressLegacy } from '@/core/counterparty/unpack/address';
import { assetNameToId } from '@/core/counterparty/unpack/assetId';
import { hexToBytes } from '@/core/counterparty/unpack/binary';
import { COUNTERPARTY_PREFIX_HEX, MessageTypeId } from '@/core/counterparty/unpack/messageTypes';

/** The message types this module can construct. */
export type PackableComposeType =
  | 'send' | 'issuance' | 'sweep' | 'destroy' | 'cancel' | 'order'
  | 'dividend' | 'fairmint' | 'fairminter' | 'dispense' | 'broadcast' | 'mpma'
  | 'attach' | 'detach' | 'utxo' | 'move' | 'btcpay' | 'dispenser'
  | 'pooldeposit' | 'poolwithdraw';

/**
 * Not every message is CBOR. The taproot_support upgrade moved enhanced send, issuance, sweep,
 * broadcast, fairminter and fairmint to CBOR; the rest still use the fixed `struct` layouts, so
 * those are packed field by field here. Both kinds carry a one-byte type id, because the
 * `short_tx_type_id` flag packs ids 1-255 into a single byte (core `parser/messagetype.py`).
 */
function uint(value: bigint, byteCount: number): number[] {
  if (value < 0n || value >= 1n << BigInt(8 * byteCount)) {
    throw new Error(`value does not fit in ${byteCount} bytes`);
  }
  const bytes: number[] = [];
  for (let i = byteCount - 1; i >= 0; i -= 1) {
    bytes.push(Number((value >> BigInt(8 * i)) & 0xffn));
  }
  return bytes;
}

export interface PackedMessage {
  /** Full payload: CNTRPRTY prefix, message type id, then the CBOR body. */
  bytes: Uint8Array;
  /** The message type id used, for error reporting. */
  messageTypeId: number;
}

/** Compose params, as normalized from the form. */
type Params = Record<string, unknown>;

/**
 * Fields a packer may take from the composed message instead of from the request, for values the
 * request cannot determine (a reissuance's divisibility, a new subasset's server-drawn asset id).
 * Each use must document why a substituted value is safe to accept, and a value the user authored
 * must never be borrowed.
 */
type Observed = Record<string, unknown> | undefined;

function requireString(params: Params, key: string): string | null {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Quantity in base units. The form supplies whole base units already (normalization happens before
 * compose), so anything non-integral means the caller has not resolved divisibility and equality
 * verification must not be attempted.
 */
function requireQuantity(params: Params, key: string): bigint | null {
  const value = params[key];
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

/**
 * Message content as core encodes it: UTF-8 for textual MIME types, hex-decoded for everything
 * else (`helpers.content_to_bytes`). This is what lets an inscription — whose content is a binary
 * file carried as hex in the request — pack to the same bytes core composes.
 *
 * Returns null when a binary type's content is not valid hex, which core would reject outright.
 */
function encodeMessageContent(content: string, mimeType: string): Uint8Array | null {
  if (isTextualMimeType(mimeType || 'text/plain')) {
    return new TextEncoder().encode(content);
  }
  if (content.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(content)) return null;
  return hexToBytes(content.toLowerCase());
}

function withPrefix(messageTypeId: number, body: Uint8Array): PackedMessage {
  const prefix = hexToBytes(COUNTERPARTY_PREFIX_HEX);
  return {
    bytes: new Uint8Array([...prefix, messageTypeId, ...body]),
    messageTypeId,
  };
}

/**
 * Enhanced send: `[asset_id, quantity, short_address_bytes, memo_bytes]`
 * (core `enhancedsend.py`, taproot_support branch).
 */
function packEnhancedSend(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const destination = requireString(params, 'destination');
  const quantity = requireQuantity(params, 'quantity');
  if (!asset || !destination || quantity === null) return null;
  // Several destinations arrive in `destinations` and pack as MPMA (`packSendAsMpma`); a comma
  // inside the singular field is not an address and cannot be an enhanced send.
  if (destination.includes(',')) return null;
  // memo_is_hex changes how core encodes the memo; only the plain-text form is packed here.
  if (params.memo_is_hex === true || params.memo_is_hex === 'true') return null;

  let assetId: bigint;
  let packedDestination: Uint8Array;
  try {
    assetId = assetNameToId(asset);
    packedDestination = packAddress(destination);
  } catch {
    return null;
  }
  if (assetId === 0n) return null; // BTC is not a Counterparty send

  const memo = typeof params.memo === 'string' ? params.memo : '';
  const memoBytes = new TextEncoder().encode(memo);

  const body: CborEncodable = [assetId, quantity, packedDestination, memoBytes];
  return withPrefix(MessageTypeId.ENHANCED_SEND, encodeCbor(body));
}

/**
 * Issuance (standard, non-subasset): `[asset_id, quantity, divisible, lock, reset, mime_type,
 * description]` (core `issuance.py`, taproot_support branch). Core packs LR_ISSUANCE_ID whenever
 * `issuance_backwards_compatibility` is active, which it is on mainnet.
 *
 * An ownership transfer packs the same message: core carries the new owner only in an output
 * paying `transfer_destination`, so the message is byte-for-byte a reissuance. The output policy
 * (`outputPolicy.ts`) is what pins the ownership output to the requested destination.
 */
function packIssuance(params: Params, observed: Observed): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const quantity = requireQuantity(params, 'quantity');
  if (!asset || quantity === null) return null;
  // A dotted asset is a subasset request, which needs its asset id borrowed from the response.
  if (asset.includes('.')) return packSubasset(asset, quantity, params, observed);
  // An inscription carries the same message; only its transport differs (an ord envelope instead
  // of an OP_RETURN), so it is packed normally and `inscriptionEnvelope.ts` checks the envelope.
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';

  let assetId: bigint;
  try {
    assetId = assetNameToId(asset);
  } catch {
    return null;
  }

  return packStandardIssuanceBody(assetId, quantity, mimeType, params, observed);
}

/**
 * The standard issuance body, shared by named-asset issuances and subasset reissuances (whose
 * borrowed asset id is resolved by the caller).
 *
 * Divisibility is the user's choice on a first issuance and the ledger's on a reissuance, where
 * the form omits it and it is borrowed from the response. Safe to borrow: core requires a
 * reissuance's divisibility to match the existing asset, so a substituted value is
 * consensus-rejected.
 */
function packStandardIssuanceBody(
  assetId: bigint,
  quantity: bigint,
  mimeType: string,
  params: Params,
  observed: Observed
): PackedMessage | null {
  const divisible = typeof params.divisible === 'boolean'
    ? params.divisible
    : typeof observed?.divisible === 'boolean' ? observed.divisible : null;
  if (divisible === null) return null;

  const description = typeof params.description === 'string' ? params.description : '';
  let descriptionBytes: Uint8Array | null = null;
  if (description.length > 0) {
    descriptionBytes = encodeMessageContent(description, mimeType);
    if (descriptionBytes === null) return null;
  }

  const body: CborEncodable = [
    assetId,
    quantity,
    divisible,
    params.lock === true,
    params.reset === true,
    mimeType,
    descriptionBytes,
  ];
  return withPrefix(MessageTypeId.LR_ISSUANCE, encodeCbor(body));
}

/**
 * The subasset name charset, in digit order: digit d encodes SUBASSET_DIGITS[d-1], and the digits
 * run 1..68 with no zero (core `assetnames.py`, SUBASSET_REVERSE). The decoder in
 * `unpack/messages/issuance.ts` is the inverse of this.
 */
const SUBASSET_DIGITS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_@!';

/**
 * Compact a subasset longname to core's wire form: the name read as a base-68 big-endian integer,
 * emitted as its minimal big-endian bytes (`assetnames.compact_subasset_longname`). Minimal bytes
 * are required — core's unpack rejects non-canonical compactions (`canonical_subasset_compact`).
 *
 * Returns null for a character outside the charset, which core refuses to compose.
 */
export function compactSubassetLongname(longname: string): Uint8Array | null {
  let integer = 0n;
  for (const char of longname) {
    const digit = SUBASSET_DIGITS.indexOf(char) + 1;
    if (digit === 0) return null;
    integer = integer * 68n + BigInt(digit);
  }
  const bytes: number[] = [];
  for (let rest = integer; rest > 0n; rest >>= 8n) {
    bytes.unshift(Number(rest & 0xffn));
  }
  return new Uint8Array(bytes);
}

/**
 * Subasset issuance, initial or reissuance. Both borrow the numeric asset id from the composed
 * message: core draws a random unused numeric asset for a new subasset
 * (`assetnames.generate_random_asset`) and resolves an existing longname through the ledger for a
 * reissuance, so the request cannot determine the id either way.
 *
 * Borrow safety: a substituted id cannot pay an attacker — an id naming someone else's asset is
 * consensus-rejected ("issued by another address") — but it can land the operation on a different
 * numeric asset the user already owns, whose divisibility happens to match. That is vandalism
 * with no profit motive, and it is **not detectable locally by any means**: the id is precisely
 * the field no local check can predict, which is why it is borrowed. Declining to pack does not
 * avoid it, because the field-comparison fallback is equally blind. Closing it needs an
 * independent ledger view — a second API source or a local index — or local composition.
 *
 * The range guard restricts the id to the numeric space subassets live in, which bounds the
 * substitution to assets of that kind rather than any named asset.
 *
 * Layout follows the composed message's decoded type. Initial (SUBASSET_ISSUANCE / LR_SUBASSET):
 * `[asset_id, quantity, divisible, lock, reset, compacted_length, compacted_name, mime_type,
 * description]` with the flags as ints (core's subasset branch writes `1 if divisible else 0`;
 * the standard branch passes booleans — a byte-level difference in CBOR). Reissuance (ISSUANCE /
 * LR_ISSUANCE): the standard layout under the borrowed id.
 */
function packSubasset(
  longname: string,
  quantity: bigint,
  params: Params,
  observed: Observed
): PackedMessage | null {
  // An inscription carries the same message; only its transport differs (an ord envelope instead
  // of an OP_RETURN), so it is packed normally and `inscriptionEnvelope.ts` checks the envelope.
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';

  // Lock, reset and transfer are packed like any other operation. Declining them was tried and
  // reverted: it did not stop a substituted asset id, since the field-comparison fallback cannot
  // see the id either, and it broke locked subassets — the fallback reports the request's longname
  // against the message's numeric asset name as a critical mismatch.

  const assetId = typeof observed?.assetId === 'bigint' ? observed.assetId : null;
  if (assetId === null || assetId <= 26n ** 12n || assetId >= 1n << 64n) return null;

  const observedType = observed?.messageTypeId;

  if (observedType === MessageTypeId.ISSUANCE || observedType === MessageTypeId.LR_ISSUANCE) {
    // Reissuance of an existing subasset: the standard layout under the borrowed id.
    return packStandardIssuanceBody(assetId, quantity, mimeType, params, observed);
  }

  if (observedType !== MessageTypeId.SUBASSET_ISSUANCE && observedType !== MessageTypeId.LR_SUBASSET) {
    return null;
  }

  // Divisibility is always the user's choice on a first issuance.
  if (typeof params.divisible !== 'boolean') return null;

  const compacted = compactSubassetLongname(longname);
  if (!compacted) return null;

  const description = typeof params.description === 'string' ? params.description : '';

  const body: CborEncodable = [
    assetId,
    quantity,
    params.divisible ? 1n : 0n,
    params.lock === true || params.lock === 'true' ? 1n : 0n,
    params.reset === true || params.reset === 'true' ? 1n : 0n,
    BigInt(compacted.length),
    compacted,
    mimeType,
    description.length > 0 ? new TextEncoder().encode(description) : null,
  ];
  return withPrefix(MessageTypeId.LR_SUBASSET, encodeCbor(body));
}

/** Sweep: CBOR `[short_address_bytes, flags, memo_bytes]` (core `sweep.py`). */
function packSweep(params: Params): PackedMessage | null {
  const destination = requireString(params, 'destination');
  const flags = requireQuantity(params, 'flags');
  if (!destination || flags === null) return null;

  let packedDestination: Uint8Array;
  try {
    packedDestination = packAddress(destination);
  } catch {
    return null;
  }

  // A binary memo is hex on the wire; only the text form is packed here.
  if (params.memo_is_hex === true || params.memo_is_hex === 'true') return null;
  const memo = typeof params.memo === 'string' ? params.memo : '';

  const body: CborEncodable = [packedDestination, flags, new TextEncoder().encode(memo)];
  return withPrefix(MessageTypeId.SWEEP, encodeCbor(body));
}

/** Destroy: `>QQ` asset id and quantity, then the tag bytes (core `destroy.py`). */
function packDestroy(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const quantity = requireQuantity(params, 'quantity');
  if (!asset || quantity === null) return null;

  let assetId: bigint;
  try {
    assetId = assetNameToId(asset);
  } catch {
    return null;
  }

  const tag = typeof params.tag === 'string' ? params.tag : '';
  const tagBytes = new TextEncoder().encode(tag);
  if (tagBytes.length > 34) return null; // core's MAX_TAG_LENGTH

  try {
    return withPrefix(MessageTypeId.DESTROY, new Uint8Array([
      ...uint(assetId, 8), ...uint(quantity, 8), ...tagBytes,
    ]));
  } catch {
    return null;
  }
}

/** Cancel: `>32s`, the offer hash (core `cancel.py`). */
function packCancel(params: Params): PackedMessage | null {
  const offerHash = requireString(params, 'offer_hash');
  if (!offerHash || !/^[0-9a-fA-F]{64}$/.test(offerHash.trim())) return null;

  return withPrefix(MessageTypeId.CANCEL, hexToBytes(offerHash.trim().toLowerCase()));
}

/**
 * Order: `>QQQQHQ` — give asset and quantity, get asset and quantity, expiration, fee required
 * (core `order.py`). Expiration is a uint16, so a larger value is not expressible.
 */
function packOrder(params: Params): PackedMessage | null {
  const giveAsset = requireString(params, 'give_asset');
  const getAsset = requireString(params, 'get_asset');
  const giveQuantity = requireQuantity(params, 'give_quantity');
  const getQuantity = requireQuantity(params, 'get_quantity');
  const expiration = requireQuantity(params, 'expiration');
  const feeRequired = requireQuantity(params, 'fee_required') ?? 0n;
  if (!giveAsset || !getAsset) return null;
  if (giveQuantity === null || getQuantity === null || expiration === null) return null;

  try {
    return withPrefix(MessageTypeId.ORDER, new Uint8Array([
      ...uint(assetNameToId(giveAsset), 8),
      ...uint(giveQuantity, 8),
      ...uint(assetNameToId(getAsset), 8),
      ...uint(getQuantity, 8),
      ...uint(expiration, 2),
      ...uint(feeRequired, 8),
    ]));
  } catch {
    return null;
  }
}

/**
 * Dividend: `>QQQ` — quantity per unit, the asset paid on, the asset paid in (core `dividend.py`).
 * A dividend paid in BTC composes no message at all, so it is declined.
 */
function packDividend(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const dividendAsset = requireString(params, 'dividend_asset');
  const quantityPerUnit = requireQuantity(params, 'quantity_per_unit');
  if (!asset || !dividendAsset || quantityPerUnit === null) return null;
  if (dividendAsset.toUpperCase() === 'BTC') return null;

  try {
    return withPrefix(MessageTypeId.DIVIDEND, new Uint8Array([
      ...uint(quantityPerUnit, 8),
      ...uint(assetNameToId(asset), 8),
      ...uint(assetNameToId(dividendAsset), 8),
    ]));
  } catch {
    return null;
  }
}

/** Fairmint: CBOR `[asset_id, quantity]` (core `fairmint.py`, fairminter_v2 branch). */
function packFairmint(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const quantity = requireQuantity(params, 'quantity');
  if (!asset || quantity === null) return null;
  if (asset.includes('.')) return null; // subasset ids need ledger resolution

  try {
    return withPrefix(MessageTypeId.FAIRMINT, encodeCbor([assetNameToId(asset), quantity]));
  } catch {
    return null;
  }
}

/**
 * Fairminter: CBOR, field order per core `fairminter.py` (fairminter_v2 branch).
 *
 * `[asset_id, asset_parent_id, price, quantity_by_price, max_mint_per_tx, max_mint_per_address,
 *   hard_cap, premint_quantity, start_block, end_block, soft_cap, soft_cap_deadline_block,
 *   minted_asset_commission_int, burn_payment, lock_description, lock_quantity, divisible]`,
 * then `[pool_quantity, lp_asset_id]` only when a pool is requested, then
 * `[mime_type, description_bytes]`.
 *
 * The form's names differ from the wire's — `lot_price` is `price`, `lot_size` is
 * `quantity_by_price` — and the defaults must match `composeFairminter`, where lot size is 1 and
 * divisible is true. Subassets are declined: their parent id comes from a ledger lookup of the
 * existing asset's longname.
 */
function packFairminter(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  if (!asset || asset.includes('.')) return null;

  const num = (key: string, fallback: bigint): bigint | null => {
    const value = params[key];
    if (value === undefined || value === '') return fallback;
    const parsed = requireQuantity(params, key);
    return parsed;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const value = params[key];
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  };

  const price = num('lot_price', 0n);
  const quantityByPrice = num('lot_size', 1n);
  const maxMintPerTx = num('max_mint_per_tx', 0n);
  const maxMintPerAddress = num('max_mint_per_address', 0n);
  const hardCap = num('hard_cap', 0n);
  const premintQuantity = num('premint_quantity', 0n);
  const startBlock = num('start_block', 0n);
  const endBlock = num('end_block', 0n);
  const softCap = num('soft_cap', 0n);
  const softCapDeadlineBlock = num('soft_cap_deadline_block', 0n);
  const poolQuantity = num('pool_quantity', 0n);
  if ([price, quantityByPrice, maxMintPerTx, maxMintPerAddress, hardCap, premintQuantity,
    startBlock, endBlock, softCap, softCapDeadlineBlock, poolQuantity].some((v) => v === null)) {
    return null;
  }

  // int(commission * 1e8), the same float arithmetic core performs.
  const commission = params.minted_asset_commission;
  const commissionInt = commission === undefined || commission === ''
    ? 0
    : Math.trunc(Number(commission) * 1e8);
  if (!Number.isSafeInteger(commissionInt) || commissionInt < 0) return null;

  const lpAsset = requireString(params, 'lp_asset');
  const description = typeof params.description === 'string' ? params.description : '';
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';

  let assetId: bigint;
  let lpAssetId = 0n;
  try {
    assetId = assetNameToId(asset);
    if (lpAsset) lpAssetId = assetNameToId(lpAsset);
  } catch {
    return null;
  }

  const fields: CborEncodable[] = [
    assetId,
    0n, // asset_parent_id — zero for a non-subasset, which is all this packs
    price!, quantityByPrice!, maxMintPerTx!, maxMintPerAddress!,
    hardCap!, premintQuantity!, startBlock!, endBlock!, softCap!, softCapDeadlineBlock!,
    BigInt(commissionInt),
    bool('burn_payment', false),
    bool('lock_description', false),
    bool('lock_quantity', false),
    bool('divisible', true),
  ];
  if (poolQuantity! > 0n) fields.push(poolQuantity!, lpAssetId);
  fields.push(mimeType, new TextEncoder().encode(description));

  return withPrefix(MessageTypeId.FAIRMINTER, encodeCbor(fields));
}

/**
 * Dispense: the message is the constant marker `0x00` (core `dispense.py`). Which dispenser is
 * paid, and how much BTC, live in the outputs and are checked by the output policy; equality here
 * only rules out a substituted message type.
 */
function packDispense(): PackedMessage {
  return withPrefix(MessageTypeId.DISPENSE, new Uint8Array([0x00]));
}

/**
 * How far into the future a borrowed broadcast timestamp may sit before the borrow is refused.
 * `verifyBroadcast` in `unpack/verify.ts` applies the same bound on the fallback path.
 */
const MAX_BORROWED_TIMESTAMP_FUTURE_SECONDS = 3600n;

/**
 * A float param as core's API receives it: absent means the compose default, a present value goes
 * through Python's `float()`. JavaScript's Number() performs the same correctly-rounded parse.
 */
function floatParam(params: Params, key: string): number | null {
  const value = params[key];
  if (value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Broadcast: CBOR `[timestamp, value, fee_fraction_int, mime_type, text_bytes]` (core
 * `broadcast.py`, taproot branch). `value` rides the wire as a float — the API coerces it with
 * `float()` and cbor2 emits every finite float as an 8-byte double — so it must stay a `number`
 * here; an integral bigint would encode differently.
 *
 * The timestamp never reaches `params`: when the caller supplies none, `composeBroadcast` stamps
 * the wallet's own clock into the request. It is borrowed from the composed message, bounded
 * against that same clock, because a substituted future timestamp settles a feed's open bets
 * before their deadline (`broadcast.py` settles once `timestamp >= deadline`). Past the bound the
 * borrow is refused. An explicit `timestamp=0` asks the server to continue the feed from ledger
 * state, which cannot be reconstructed here.
 *
 * Inscriptions and non-text MIME types are declined: the ord path restructures the content into a
 * tapscript envelope, and a non-text MIME makes core hex-decode the text (`content_to_bytes`).
 */
function packBroadcast(params: Params, observed: Observed): PackedMessage | null {
  if (typeof params.text !== 'string') return null;
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';

  const value = floatParam(params, 'value');
  const feeFraction = floatParam(params, 'fee_fraction');
  if (value === null || feeFraction === null) return null;
  // int(fee_fraction * 1e8), the same float arithmetic core performs.
  const feeFractionInt = Math.trunc(feeFraction * 1e8);
  if (!Number.isSafeInteger(feeFractionInt) || feeFractionInt < 0) return null;

  let timestamp = requireQuantity(params, 'timestamp');
  if (timestamp === 0n) return null;
  if (timestamp === null) {
    const seen = observed?.timestamp;
    if (typeof seen !== 'number' || !Number.isSafeInteger(seen) || seen <= 0) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (BigInt(seen) > now + MAX_BORROWED_TIMESTAMP_FUTURE_SECONDS) return null;
    timestamp = BigInt(seen);
  }

  const textBytes = encodeMessageContent(params.text, mimeType);
  if (textBytes === null) return null;

  const body: CborEncodable = [
    timestamp,
    value,
    BigInt(feeFractionInt),
    mimeType,
    textBytes,
  ];
  return withPrefix(MessageTypeId.BROADCAST, encodeCbor(body));
}

/** MSB-first bit accumulator, the mirror of the unpacker's BitReader (`unpack/messages/mpma.ts`). */
class BitWriter {
  private bits: number[] = [];

  writeBit(bit: boolean): void {
    this.bits.push(bit ? 1 : 0);
  }

  writeUint(value: bigint, bitCount: number): void {
    for (let i = bitCount - 1; i >= 0; i -= 1) {
      this.bits.push(Number((value >> BigInt(i)) & 1n));
    }
  }

  writeBytes(bytes: Uint8Array): void {
    for (const byte of bytes) this.writeUint(BigInt(byte), 8);
  }

  /** Zero-pad to a byte boundary and return the bytes, as core's BitArray-to-bytes does. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, index) => {
      if (bit) out[index >> 3]! |= 0x80 >> (index & 7);
    });
    return out;
  }
}

/** One send of an MPMA message, after the params have been parsed and validated. */
interface MpmaSend {
  asset: string;
  destination: string;
  quantity: bigint;
  memo: string | null;
  memoIsHex: boolean;
}

/**
 * Append a memo in core's bit format: a presence bit, is_hex, a 6-bit *byte* length, then the
 * bytes (`mpmaencoding._encode_memo`). Returns false for a memo core cannot encode — over 63
 * bytes, or hex with an odd length or non-hex character. Core wraps this step in a bare `except`
 * and silently drops such memos; declining to pack keeps a memo-dropping response from verifying.
 */
function writeMemo(writer: BitWriter, memo: string | null, isHex: boolean): boolean {
  if (memo === null || memo === '') {
    writer.writeBit(false);
    return true;
  }
  let bytes: Uint8Array;
  if (isHex) {
    if (memo.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(memo)) return false;
    bytes = hexToBytes(memo.toLowerCase());
  } else {
    bytes = new TextEncoder().encode(memo);
  }
  if (bytes.length > 63) return false;

  writer.writeBit(true);
  writer.writeBit(isHex);
  writer.writeUint(BigInt(bytes.length), 6);
  writer.writeBytes(bytes);
  return true;
}

/**
 * MPMA send: a `>H`-counted LUT of legacy-packed destination addresses sorted lexicographically,
 * then a bit stream — a global memo, and per asset (sorted by name) a `1` continuation bit, the
 * 64-bit asset id, an nbits-wide send count less one, and each send's nbits-wide LUT index, 64-bit
 * quantity and memo — terminated by a `0` bit and zero-padded to a byte
 * (core `mpmaencoding._encode_mpma_send`; nbits is ceil(log2(LUT size))).
 *
 * A single distinct destination makes nbits zero: the count and index fields occupy no bits
 * (bitstring 4.1.4, core's pin, appends nothing for `uint:0`; newer versions raise) and the
 * decoder infers one recipient per asset. An asset group with several sends is therefore not
 * expressible at nbits zero — core's encoder raises on it.
 *
 * Declined when core could not compose the same request: a Taproot or P2WSH destination does not
 * fit the 21-byte legacy packing, a subasset resolves through the ledger, and BTC cannot be sent
 * by message. The LUT and the asset groups are sorted; sends within an asset keep request order.
 */
function packMpma(sends: MpmaSend[], globalMemo: string | null, globalMemoIsHex: boolean): PackedMessage | null {
  if (sends.length < 2) return null;
  for (const send of sends) {
    if (!send.asset || send.asset === 'BTC' || send.asset.includes('.')) return null;
    if (send.quantity <= 0n || send.quantity >= 1n << 64n) return null;
  }

  const lutAddresses = [...new Set(sends.map((send) => send.destination))].sort();
  const nbits = lutAddresses.length > 1 ? Math.ceil(Math.log2(lutAddresses.length)) : 0;

  let lut: Uint8Array[];
  try {
    lut = lutAddresses.map((address) => packAddressLegacy(address));
  } catch {
    return null;
  }

  const writer = new BitWriter();
  if (!writeMemo(writer, globalMemo, globalMemoIsHex)) return null;

  const assets = [...new Set(sends.map((send) => send.asset))].sort();
  for (const asset of assets) {
    const assetSends = sends.filter((send) => send.asset === asset);
    // At nbits zero the count field has no bits, so only one send per asset is expressible.
    if (nbits === 0 && assetSends.length > 1) return null;
    writer.writeBit(true);
    try {
      writer.writeUint(assetNameToId(asset), 64);
    } catch {
      return null;
    }
    writer.writeUint(BigInt(assetSends.length - 1), nbits);
    for (const send of assetSends) {
      writer.writeUint(BigInt(lutAddresses.indexOf(send.destination)), nbits);
      writer.writeUint(send.quantity, 64);
      if (!writeMemo(writer, send.memo, send.memoIsHex)) return null;
    }
  }
  writer.writeBit(false);

  const lutBytes = new Uint8Array(2 + lut.length * 21);
  lutBytes[0] = lut.length >> 8;
  lutBytes[1] = lut.length & 0xff;
  lut.forEach((packed, index) => { lutBytes.set(packed, 2 + index * 21); });

  const body = new Uint8Array([...lutBytes, ...writer.toBytes()]);
  return withPrefix(MessageTypeId.MPMA_SEND, body);
}

/**
 * Parse MPMA params as the wallet's forms produce them: parallel comma-separated `assets`,
 * `destinations` and `quantities`, optional per-send `memos` (empty entries mean none) with a
 * `memos_are_hex` flag, and an optional whole-send `memo`/`memo_is_hex` used when no per-send
 * memos are given. Quantities must be whole base units; a non-integral value means divisibility
 * was not resolved and equality must not be attempted.
 *
 * Core's API applies a single `memos_are_hex` flag to every memo, so a mixed list is not
 * expressible; `composeMPMA` refuses to send one, and it is declined here.
 */
function packMpmaFromParams(params: Params): PackedMessage | null {
  const assetsCsv = requireString(params, 'assets');
  const destinationsCsv = requireString(params, 'destinations');
  const quantitiesCsv = requireString(params, 'quantities');
  if (!assetsCsv || !destinationsCsv || !quantitiesCsv) return null;

  const assets = assetsCsv.split(',');
  const destinations = destinationsCsv.split(',');
  const quantities = quantitiesCsv.split(',');
  if (assets.length !== destinations.length || assets.length !== quantities.length) return null;

  const memosCsv = typeof params.memos === 'string' && params.memos !== ''
    ? params.memos.split(',')
    : null;
  if (memosCsv && memosCsv.length !== assets.length) return null;

  let memosAreHex = false;
  if (memosCsv) {
    const flagValues = typeof params.memos_are_hex === 'string'
      ? params.memos_are_hex.split(',').map((value) => value === 'true')
      : [params.memos_are_hex === true];
    // Only the flags belonging to a memo matter. The form emits one flag per row, and a row with
    // no memo emits `false`, so a batch mixing a hex memo with an empty one would otherwise look
    // like a hex/text mix and decline — the common shape when only some rows carry memos.
    // `composeMPMA` filters the same way before choosing the single flag it sends.
    const flagsForMemos = flagValues.filter((_, index) => (memosCsv[index] ?? '') !== '');
    if (new Set(flagsForMemos).size > 1) return null;
    memosAreHex = flagsForMemos[0] ?? false;
  }

  const sends: MpmaSend[] = [];
  for (let i = 0; i < assets.length; i += 1) {
    const quantity = requireQuantity({ quantity: quantities[i]!.trim() }, 'quantity');
    if (quantity === null) return null;
    const memo = memosCsv ? memosCsv[i]! : null;
    sends.push({
      asset: assets[i]!.trim(),
      destination: destinations[i]!.trim(),
      quantity,
      memo: memo === '' ? null : memo,
      memoIsHex: memosAreHex,
    });
  }

  const globalMemo = !memosCsv && typeof params.memo === 'string' && params.memo !== ''
    ? params.memo
    : null;
  const globalMemoIsHex = params.memo_is_hex === true || params.memo_is_hex === 'true';

  return packMpma(sends, globalMemo, globalMemo === null ? false : globalMemoIsHex);
}

/**
 * The send form's multi-destination convenience: `composeSendOrMPMA` turns comma-separated
 * destinations into an MPMA send of the same asset, quantity and memo to each, with the memo
 * carried once as the whole-send memo.
 */
function packSendAsMpma(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const quantity = requireQuantity(params, 'quantity');
  const destinations = requireString(params, 'destinations');
  if (!asset || quantity === null || !destinations) return null;

  const list = destinations.split(',').map((destination) => destination.trim());
  return packMpmaFromParams({
    assets: list.map(() => asset).join(','),
    destinations: list.join(','),
    quantities: list.map(() => quantity.toString()).join(','),
    ...(typeof params.memo === 'string' && params.memo !== ''
      ? { memo: params.memo, memo_is_hex: params.memo_is_hex }
      : {}),
  });
}

/**
 * Build the message bytes a compose request should produce, or null when this build cannot
 * construct them (unsupported type, or a value the request does not determine).
 *
 * A null return means "cannot verify by equality" — never "verified".
 */

/**
 * Pipe-delimited body, the form core uses for the UTXO family.
 *
 * `"|".join(str(v) for v in [...])` in core, UTF-8 encoded, with a value that is None written as
 * the empty string. No length prefixes — the field count is fixed per type and core tuple-unpacks
 * it, so an extra or missing field voids the message.
 */
function packPipeDelimited(messageTypeId: number, fields: Array<string | number | bigint>): PackedMessage {
  const body = new TextEncoder().encode(fields.map((f) => String(f)).join('|'));
  return withPrefix(messageTypeId, body);
}

/** attach: `asset|quantity|destination_vout` (attach.py). An absent vout is the empty string. */
function packAttach(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const quantity = requireQuantity(params, 'quantity');
  if (!asset || quantity === null) return null;

  const vout = params.destination_vout;
  const voutText = vout === undefined || vout === null || vout === '' ? '' : String(vout);
  return packPipeDelimited(MessageTypeId.UTXO_ATTACH, [asset, quantity, voutText]);
}

/**
 * detach: the destination address alone, or the single byte "0" when none is given.
 *
 * Core writes b"0" rather than an empty body specifically to avoid a protocol change in
 * `messagetype.unpack()` (detach.py), so the empty case is that literal, not an empty string.
 */
function packDetach(params: Params): PackedMessage | null {
  const destination = typeof params.destination === 'string' ? params.destination : '';
  return withPrefix(
    MessageTypeId.UTXO_DETACH,
    new TextEncoder().encode(destination === '' ? '0' : destination)
  );
}

/** utxo move: `source|destination|asset|quantity` (utxo.py). */
function packUtxoMove(params: Params): PackedMessage | null {
  const source = requireString(params, 'source');
  const asset = requireString(params, 'asset');
  const quantity = requireQuantity(params, 'quantity');
  if (!source || !asset || quantity === null) return null;

  const destination = typeof params.destination === 'string' ? params.destination : '';
  return packPipeDelimited(MessageTypeId.UTXO, [source, destination, asset, quantity]);
}

/** btcpay: `">32s32s"` — the two transaction hashes of the order match (btcpay.py). */
function packBtcPay(params: Params): PackedMessage | null {
  const id = requireString(params, 'order_match_id');
  if (!id) return null;

  // Core splits the id on "_" into two 32-byte hashes.
  const [tx0, tx1] = id.split('_');
  if (!tx0 || !tx1) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(tx0) || !/^[0-9a-fA-F]{64}$/.test(tx1)) return null;
  const a = hexToBytes(tx0.toLowerCase());
  const b = hexToBytes(tx1.toLowerCase());

  return withPrefix(MessageTypeId.BTC_PAY, new Uint8Array([...a, ...b]));
}

/**
 * Dispenser statuses, as core names them (`dispenser.py`). Which trailing addresses a message
 * carries depends entirely on these.
 */
const DISPENSER_STATUS = { OPEN: 0n, OPEN_EMPTY_ADDRESS: 1n, CLOSED: 10n } as const;

/**
 * dispenser: `">QQQQB"` — asset_id, give_quantity, escrow_quantity, mainchainrate, status —
 * optionally followed by a 21-byte action address and a 21-byte oracle address (dispenser.py).
 */
function packDispenser(params: Params): PackedMessage | null {
  const asset = requireString(params, 'asset');
  if (!asset) return null;

  // Defaults mirror `composeDispenser`, which is what actually reaches the API: an open omits
  // `status` and a close omits the three quantities, and it sends 0 for each. Requiring them here
  // meant no dispenser request could be packed at all, so byte equality — the strongest check —
  // silently never ran for this type and every dispenser fell back to field comparison.
  const give = requireQuantity(params, 'give_quantity') ?? 0n;
  const escrow = requireQuantity(params, 'escrow_quantity') ?? 0n;
  const rate = requireQuantity(params, 'mainchainrate') ?? 0n;
  const status = requireQuantity(params, 'status') ?? 0n;
  if (status > 255n) return null;

  let assetId: bigint;
  try {
    assetId = assetNameToId(asset);
  } catch {
    return null;
  }

  const body: number[] = [
    ...uint(assetId, 8),
    ...uint(give, 8),
    ...uint(escrow, 8),
    ...uint(rate, 8),
    Number(status),
  ];

  // Trailing addresses, packed legacy-style as core does for this message — but only for the
  // statuses that carry them. Core appends `open_address` when opening on an empty address, or
  // when closing a dispenser held on a *different* address than the one signing; it appends
  // `oracle_address` only while opening (`dispenser.py`). Appending whichever address the request
  // happened to carry produced bytes core never composes, and byte equality is fail-closed, so it
  // blocked the transaction outright — a close naming its own address was refused on those 21
  // extra bytes.
  const source = requireString(params, 'sourceAddress') ?? '';
  const openAddress = requireString(params, 'open_address') ?? '';
  const oracleAddress = requireString(params, 'oracle_address') ?? '';

  const trailing: string[] = [];
  if (openAddress !== ''
    && (status === DISPENSER_STATUS.OPEN_EMPTY_ADDRESS
      || (status === DISPENSER_STATUS.CLOSED && openAddress !== source))) {
    trailing.push(openAddress);
  }
  if (oracleAddress !== ''
    && (status === DISPENSER_STATUS.OPEN || status === DISPENSER_STATUS.OPEN_EMPTY_ADDRESS)) {
    trailing.push(oracleAddress);
  }

  for (const address of trailing) {
    const packed = packAddressLegacy(address);
    if (!packed) return null;
    body.push(...packed);
  }

  return withPrefix(MessageTypeId.DISPENSER, new Uint8Array(body));
}

/** pooldeposit: `">QQQQQQ"` — asset ids, quantities, min LP quantity, LP asset id. */
function packPoolDeposit(params: Params, observed: Observed): PackedMessage | null {
  const assetA = requireString(params, 'asset_a');
  const assetB = requireString(params, 'asset_b');
  const qtyA = requireQuantity(params, 'quantity_a');
  const qtyB = requireQuantity(params, 'quantity_b');
  const minLp = requireQuantity(params, 'min_lp_quantity') ?? 0n;
  if (!assetA || !assetB || qtyA === null || qtyB === null) return null;

  // The LP asset id core packs is not a function of the request alone.
  //
  //     if existing_pool is None and lp_asset is None:
  //         lp_asset = assetnames.generate_random_asset(f"{sorted_a}:{sorted_b}")
  //     ...
  //     lp_asset_id = generate_asset_id(lp_asset) if existing_pool is None and lp_asset else 0
  //
  // So it is 0 for a deposit into an existing pool, the named asset's id when the request names
  // one, and a *random* draw for the first deposit into a new pool that names none — which the
  // wallet's own form allows, since the LP name is optional there. Packing 0 for that case made
  // byte equality reject every first deposit; the LP field is only offered on a new pool, so
  // leaving it blank was the ordinary path.
  //
  // Borrowing the id is safe for the same reason a new subasset's id is: core requires an LP asset
  // to be numeric and unused (`pooldeposit.py` — "lp_asset ... is already in use", "must be a
  // numeric asset"), so a substituted id is rejected by consensus and the deposit never executes.
  // A named LP asset is the user's own choice and is packed from the request, where a substitution
  // still fails equality.
  const lpAsset = requireString(params, 'lp_asset');
  const drawn = observed?.lpAssetId;
  // Absent from the request: 0 unless the composed message drew one, and only a draw from the
  // numeric-asset range is one core could have generated. Anything else — an existing named
  // asset's id, say — is declined rather than blessed by borrowing it.
  const borrowedLpId = typeof drawn !== 'bigint' || drawn === 0n
    ? 0n
    : drawn > 26n ** 12n && drawn < 1n << 64n ? drawn : null;
  if (lpAsset === null && borrowedLpId === null) return null;

  let ids: [bigint, bigint, bigint];
  try {
    ids = [
      assetNameToId(assetA),
      assetNameToId(assetB),
      lpAsset === null ? borrowedLpId! : assetNameToId(lpAsset),
    ];
  } catch {
    return null;
  }

  return withPrefix(MessageTypeId.POOL_DEPOSIT, new Uint8Array([
    ...uint(ids[0], 8), ...uint(ids[1], 8),
    ...uint(qtyA, 8), ...uint(qtyB, 8),
    ...uint(minLp, 8), ...uint(ids[2], 8),
  ]));
}

/** poolwithdraw: `">QQQQQ"` — asset ids, LP quantity burned, and the two minimums. */
function packPoolWithdraw(params: Params): PackedMessage | null {
  const assetA = requireString(params, 'asset_a');
  const assetB = requireString(params, 'asset_b');
  const quantity = requireQuantity(params, 'quantity');
  const minA = requireQuantity(params, 'min_quantity_a') ?? 0n;
  const minB = requireQuantity(params, 'min_quantity_b') ?? 0n;
  if (!assetA || !assetB || quantity === null) return null;

  let idA: bigint;
  let idB: bigint;
  try {
    idA = assetNameToId(assetA);
    idB = assetNameToId(assetB);
  } catch {
    return null;
  }

  return withPrefix(MessageTypeId.POOL_WITHDRAW, new Uint8Array([
    ...uint(idA, 8), ...uint(idB, 8),
    ...uint(quantity, 8), ...uint(minA, 8), ...uint(minB, 8),
  ]));
}

export function packComposeMessage(
  composeType: string,
  params: Params,
  observed?: Observed
): PackedMessage | null {
  switch (composeType) {
    case 'send':
      // Several comma-separated destinations compose as MPMA (`composeSendOrMPMA`).
      if (typeof params.destinations === 'string' && params.destinations.includes(',')) {
        return packSendAsMpma(params);
      }
      return packEnhancedSend(params);
    case 'mpma':
      return packMpmaFromParams(params);
    case 'issuance':
      return packIssuance(params, observed);
    case 'sweep':
      return packSweep(params);
    case 'destroy':
      return packDestroy(params);
    case 'cancel':
      return packCancel(params);
    case 'order':
      return packOrder(params);
    case 'dividend':
      return packDividend(params);
    case 'fairmint':
      return packFairmint(params);
    case 'fairminter':
      return packFairminter(params);
    case 'dispense':
      return packDispense();
    case 'broadcast':
      return packBroadcast(params, observed);
    case 'attach':
      return packAttach(params);
    case 'detach':
      return packDetach(params);
    case 'utxo':
    case 'move':
      return packUtxoMove(params);
    case 'btcpay':
      return packBtcPay(params);
    case 'dispenser':
      return packDispenser(params);
    case 'pooldeposit':
      return packPoolDeposit(params, observed);
    case 'poolwithdraw':
      return packPoolWithdraw(params);
    default:
      return null;
  }
}
