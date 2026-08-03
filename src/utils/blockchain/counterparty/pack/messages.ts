/**
 * Local construction of the Counterparty message bytes a compose request should produce.
 *
 * This is the mirror of `unpack/messages/*`, and exists so verification can be a single byte
 * comparison rather than a field-by-field walk. Field-by-field comparison fails open — a field
 * nobody enumerated goes unchecked — whereas comparing the whole message catches any difference,
 * including in fields this build has never heard of. counterparty-core validates its own
 * composition the same way (`check_transaction_sanity` asserts `tx_data == data`). See ADR-019.
 *
 * Field order and encoding follow core's compose functions exactly
 * (`lib/messages/versions/enhancedsend.py`, `lib/messages/issuance.py`), because the output is
 * compared byte-for-byte. Only the taproot_support (CBOR) encoding is produced: protocol features
 * activate at a block height and never turn off, so every present-day compose is CBOR.
 *
 * Coverage is deliberately partial. A type that cannot be packed yields `null`, and the caller
 * treats that as "cannot verify by equality" rather than as agreement — adding a type is opt-in and
 * its absence is loud, which is the opposite of the enumeration problem this replaces.
 */

import { encodeCbor, type CborEncodable } from './cbor';
import { assetNameToId } from '../unpack/assetId';
import { packAddress, packAddressLegacy } from '../unpack/address';
import { MessageTypeId, COUNTERPARTY_PREFIX_HEX } from '../unpack/messageTypes';
import { hexToBytes } from '../unpack/binary';

/** The message types this module can construct. */
export type PackableComposeType =
  | 'send' | 'issuance' | 'sweep' | 'destroy' | 'cancel' | 'order'
  | 'dividend' | 'fairmint' | 'fairminter' | 'dispense' | 'broadcast' | 'mpma';

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
 * Fields a packer may take from the composed message instead of from the request.
 *
 * Some values are not the user's to choose — a reissuance's divisibility is fixed by the asset that
 * already exists. Declining to pack those types would leave every other field of a common flow
 * (update description, transfer ownership) unverified, so instead the unknowable field is read back
 * from the response and everything else is still compared byte for byte.
 *
 * This is a deliberate hole, so each use must argue why the borrowed field is safe to accept — the
 * bar being that a wrong value cannot help an attacker, because consensus would reject the
 * transaction anyway. Never borrow a value the user authored.
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
 */
function packIssuance(params: Params, observed: Observed): PackedMessage | null {
  const asset = requireString(params, 'asset');
  const quantity = requireQuantity(params, 'quantity');
  if (!asset || quantity === null) return null;
  // A transfer moves ownership via an output; equality on the message alone would not cover it.
  if (requireString(params, 'transfer_destination')) return null;
  // A dotted asset is a subasset request, which composes a different layout.
  if (asset.includes('.')) return packSubassetIssuance(asset, quantity, params, observed);
  // The ord-inscription path restructures the message, and a non-text MIME type makes core
  // hex-decode the description (`helpers.content_to_bytes`); neither variant is packed here.
  if (params.inscription) return null;
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';
  if (mimeType !== '' && mimeType !== 'text/plain') return null;

  // Divisibility is the user's choice on a first issuance and the ledger's on a reissuance, where
  // the form omits it. Borrowing it from the response keeps reissuances — update description,
  // transfer ownership — byte-verified in every other field. Safe to borrow: core requires a
  // reissuance's divisibility to match the existing asset, so a substituted value yields a
  // transaction consensus rejects rather than one that moves value.
  const divisible = typeof params.divisible === 'boolean'
    ? params.divisible
    : typeof observed?.divisible === 'boolean' ? observed.divisible : null;
  if (divisible === null) return null;

  let assetId: bigint;
  try {
    assetId = assetNameToId(asset);
  } catch {
    return null;
  }

  const description = typeof params.description === 'string' ? params.description : '';

  const body: CborEncodable = [
    assetId,
    quantity,
    divisible,
    params.lock === true,
    params.reset === true,
    mimeType,
    description.length > 0 ? new TextEncoder().encode(description) : null,
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
 * emitted as its minimal big-endian bytes (`assetnames.compact_subasset_longname`). Minimality
 * matters — core's unpack rejects non-canonical compactions (`canonical_subasset_compact`), and a
 * leading zero byte would also fail byte equality against core's own output.
 *
 * Returns null for a character outside the charset, which core would refuse to compose anyway.
 */
function compactSubassetLongname(longname: string): Uint8Array | null {
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
 * Initial subasset issuance: CBOR `[asset_id, quantity, divisible, lock, reset, compacted_length,
 * compacted_name, mime_type, description]` under LR_SUBASSET, since
 * `issuance_backwards_compatibility` is active on mainnet. The flags are packed as ints — core's
 * subasset branch writes `1 if divisible else 0` where the standard branch passes booleans
 * (`issuance.py`), and int versus bool is a byte-level difference in CBOR.
 *
 * Only the *initial* issuance takes this layout. Core composes a reissuance of an existing
 * subasset as a standard-layout message whose asset id resolves through the ledger, so a response
 * that decodes to anything but a subasset layout is declined here and falls back to field
 * comparison.
 *
 * The asset id is borrowed from the composed message: core names a new subasset by drawing a
 * random unused numeric asset at compose time (`assetnames.generate_random_asset`), so the request
 * cannot determine it. Safe to borrow: the longname — which the user did author — is still
 * byte-compared through its compaction, and a substituted id cannot pay an attacker. An id naming
 * someone else's asset is consensus-rejected ("issued by another address"), and an id naming an
 * asset the source already owns degrades the transaction into a reissuance of the user's own asset
 * to themselves. The range guard pins the id to the numeric space core draws from.
 */
function packSubassetIssuance(
  longname: string,
  quantity: bigint,
  params: Params,
  observed: Observed
): PackedMessage | null {
  const observedType = observed?.messageTypeId;
  if (observedType !== MessageTypeId.SUBASSET_ISSUANCE && observedType !== MessageTypeId.LR_SUBASSET) {
    return null;
  }
  // Divisibility is always the user's choice here: only a first issuance packs this layout.
  if (typeof params.divisible !== 'boolean') return null;
  // The ord-inscription path restructures the message, and a non-text MIME type makes core
  // hex-decode the description (`helpers.content_to_bytes`); neither variant is packed here.
  if (params.inscription) return null;
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';
  if (mimeType !== '' && mimeType !== 'text/plain') return null;

  const assetId = typeof observed?.assetId === 'bigint' ? observed.assetId : null;
  if (assetId === null || assetId <= 26n ** 12n || assetId >= 1n << 64n) return null;

  const compacted = compactSubassetLongname(longname);
  if (!compacted) return null;

  const description = typeof params.description === 'string' ? params.description : '';

  const body: CborEncodable = [
    assetId,
    quantity,
    params.divisible ? 1n : 0n,
    params.lock === true ? 1n : 0n,
    params.reset === true ? 1n : 0n,
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
 * Dispense: the message is the constant marker `0x00` (core `dispense.py`). Which dispenser is paid
 * and how much BTC it receives live in the transaction's outputs, not here, and the output policy
 * checks those against the requested dispenser. Equality on this message is therefore narrow — it
 * proves only that the response did not substitute some other message type — but that is still more
 * than the type check it replaces.
 */
function packDispense(): PackedMessage {
  return withPrefix(MessageTypeId.DISPENSE, new Uint8Array([0x00]));
}

/**
 * How far into the future a borrowed broadcast timestamp may sit before the borrow is refused.
 * `verifyBroadcast` in `unpack/verify.ts` applies the same bound to the field-comparison fallback,
 * so a refusal here does not become an allowance there.
 */
const MAX_BORROWED_TIMESTAMP_FUTURE_SECONDS = 3600n;

/**
 * A float param as core's API receives it: absent means the compose function's default, and a
 * present value goes through Python's `float()`. JavaScript's Number() performs the same
 * correctly-rounded decimal parse, and both sides then share IEEE-754 double arithmetic, so the
 * wire bytes agree.
 */
function floatParam(params: Params, key: string): number | null {
  const value = params[key];
  if (value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Broadcast: CBOR `[timestamp, value, fee_fraction_int, mime_type, text_bytes]` (core
 * `broadcast.py`, taproot branch). `value` rides the wire as a float — the API coerces the param
 * with `float()` and cbor2 emits every finite float as an 8-byte double — so it must stay a
 * `number` here, where an integral bigint would encode differently.
 *
 * The timestamp is the one field the form does not carry: when the caller supplies none,
 * `composeBroadcast` stamps the wallet's own clock into the request, and that value never reaches
 * `params`. It is borrowed from the composed message instead, bounded against the same clock that
 * stamped it — an honest response echoes a timestamp taken moments earlier, while a substituted
 * future timestamp is how a feed's open bets get settled before their deadline (`broadcast.py`
 * settles once `timestamp >= deadline`). Past the bound the borrow is refused and verification
 * falls back to field comparison, which applies the same bound. A request that explicitly passes
 * `timestamp=0` asks the server to continue the feed from ledger state, which cannot be
 * reconstructed here.
 *
 * Inscriptions and non-text MIME types are declined: the ord path restructures the content into a
 * tapscript envelope, and a non-text MIME makes core hex-decode the text (`content_to_bytes`).
 */
function packBroadcast(params: Params, observed: Observed): PackedMessage | null {
  if (typeof params.text !== 'string') return null;
  if (params.inscription) return null;
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';
  if (mimeType !== '' && mimeType !== 'text/plain') return null;

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

  const body: CborEncodable = [
    timestamp,
    value,
    BigInt(feeFractionInt),
    mimeType,
    new TextEncoder().encode(params.text),
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
 * Append a memo in core's bit format: a presence bit, then is_hex, a 6-bit *byte* length, and the
 * bytes (`mpmaencoding._encode_memo`). Returns false for a memo core cannot encode — over 63
 * bytes, or hex with an odd length or a non-hex character. Core's encoder wraps this step in a
 * bare `except` and silently drops such memos from the message; declining to pack is the honest
 * mirror, because byte-agreeing with a message that ignored the user's memo would verify the
 * very substitution this comparison exists to catch.
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
 * A single distinct destination makes nbits zero: the count and index fields occupy no bits at
 * all (bitstring 4.1.4, core's pin, appends nothing for `uint:0` — newer versions raise, so this
 * was checked against the pinned version) and the decoder infers one recipient per asset. That
 * also means an asset group with several sends cannot be expressed at nbits zero; core's encoder
 * would raise, and its validate rejects duplicate asset-destination pairs anyway.
 *
 * Declined when core could not compose the same request: a Taproot or P2WSH destination does not
 * fit the 21-byte legacy packing; a subasset resolves through the ledger; and BTC cannot be sent
 * by message. Order matters twice — the LUT and the asset groups are sorted, but sends within an
 * asset keep request order — and both are what the decoder round-trips.
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
  lut.forEach((packed, index) => lutBytes.set(packed, 2 + index * 21));

  const body = new Uint8Array([...lutBytes, ...writer.toBytes()]);
  return withPrefix(MessageTypeId.MPMA_SEND, body);
}

/**
 * Parse MPMA params as the wallet's forms produce them: parallel comma-separated `assets`,
 * `destinations` and `quantities`, optional per-send `memos` (empty entries mean none) with a
 * `memos_are_hex` flag, and an optional whole-send `memo`/`memo_is_hex` used when no per-send
 * memos are given. Quantities are whole base units — normalization happens before compose — so a
 * non-integral value means divisibility was not resolved and equality must not be attempted.
 *
 * `memos_are_hex` may arrive as one value or a comma-separated list from the form; core's API
 * applies a single flag to every memo, so a mixed list is not expressible and `composeMPMA`
 * refuses to send it — mirrored here by declining.
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
    if (new Set(flagValues).size > 1) return null;
    memosAreHex = flagValues[0] ?? false;
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
    default:
      return null;
  }
}
