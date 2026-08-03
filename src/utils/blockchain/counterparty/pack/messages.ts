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
import { packAddress } from '../unpack/address';
import { MessageTypeId, COUNTERPARTY_PREFIX_HEX } from '../unpack/messageTypes';
import { hexToBytes } from '../unpack/binary';

/** The message types this module can construct. */
export type PackableComposeType = 'send' | 'issuance' | 'sweep' | 'destroy' | 'cancel' | 'order';

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
  // A multi-destination send composes as MPMA, which this module does not pack.
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
  // Subassets carry a compacted parent name this module does not construct.
  if (asset.includes('.')) return null;
  // A transfer moves ownership via an output; equality on the message alone would not cover it.
  if (requireString(params, 'transfer_destination')) return null;

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
  const mimeType = typeof params.mime_type === 'string' ? params.mime_type : '';

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
      return packEnhancedSend(params);
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
    default:
      return null;
  }
}
