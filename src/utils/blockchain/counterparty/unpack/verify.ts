/**
 * Transaction Verification
 *
 * Verifies that a composed transaction matches what the user requested. Compares against the
 * normalized form data (the user's intent), never against `response.result.params` — the API's echo
 * of the request cannot testify about the API.
 *
 * ### ADR-019: The composer is untrusted, and verification is structural
 *
 * **Context.** Counterparty transactions are not built locally. The user's form input is sent to a
 * counterparty-core API which *composes* the transaction and returns raw bytes to sign. That makes
 * the composer a party to every transaction, and the trust boundary diagram in AUDIT.md previously
 * did not name it. This ADR settles the question the rest of this module depends on.
 *
 * **Decision.** The composer is **untrusted**. The API endpoint is user-configurable and may be
 * infrastructure this project does not run, so a response is treated as an adversarial input in the
 * same category as a dApp request. (Horizon Wallet, the other Counterparty wallet, makes the
 * opposite choice — it signs the API's response without local verification — which is defensible
 * for them because they operate both the wallet and the node. That assumption is not available
 * here.)
 *
 * **Consequences — verification must be structural, not enumerated.** Field-by-field comparison of
 * a response fails open: a field nobody enumerated is silently unchecked, which is the root cause of
 * every verification defect found in the 0.6.x cycle. The architecture is therefore four layers,
 * mirroring what counterparty-core itself asserts in `check_transaction_sanity`:
 *
 * 1. **Message payload** — where the message can be built locally (`pack/messages.ts`: send,
 *    MPMA including the send form's multi-destination flow, issuance including initial subassets,
 *    sweep, destroy, cancel, order, dividend, fairmint,
 *    fairminter, dispense and broadcast), verification is byte equality and any difference is
 *    fatal, with no severity gradation: equality asks whether the composer produced what was asked,
 *    and that answer is binary. A few values the request cannot determine — a reissuance's
 *    divisibility, a new subasset's randomly drawn asset id, a wallet-stamped broadcast timestamp —
 *    are borrowed from the composed message under the argued conditions in `pack/messages.ts`
 *    (`Observed`), and everything the user authored still has to match byte for byte. Severity
 *    belongs only to the field-by-field fallback used for what still cannot be built — an
 *    inscription's tapscript envelope, or a subasset lock/reset/transfer, where a substituted
 *    borrowed id would do irreversible harm and the borrow refuses — because that path can speak
 *    only to fields it was taught about. Packing returns null rather than guess, so equality
 *    applies only where the bytes are known exactly.
 *
 *    Two oracles keep the packers honest, both nightly:
 *    `coreOracle.test.ts` asks a live node what it would compose for a set of params and requires
 *    our bytes to match — the strongest check, but limited to types core can compose from a
 *    synthetic request. `onchainRoundTrip.test.ts` covers the rest by rebuilding real confirmed
 *    transactions and requiring byte equality with the chain, which needs no ledger state and is how
 *    dividend and fairmint are validated. The compose oracle's first run caught `packAddress`
 *    emitting legacy prefixes where core emits modern ones, which would have rejected every send to
 *    a legacy address.
 * 2. **Outputs** — every output must be positively explained (the data output, an intended
 *    destination, or provable change). Anything unexplained rejects the transaction. Deny-by-default
 *    is what makes unknown-field drift fail closed. See `outputPolicy.ts`.
 * 3. **Inputs** — values are resolved independently and never taken from the response. A signature
 *    committing to the amount (BIP-143) is *not* accepted as a substitute; Trezor shipped that
 *    reasoning in 2020 and it was broken by replaying signatures across confirmation rounds.
 * 4. **Display** — the approval screen is derived from the decoded transaction, never from the
 *    API's echoed params, so that a gap in any layer above remains visible to the user rather than
 *    being papered over by a screen that agrees with the attacker. The composer carries the decoded
 *    message in `state.decodedMessage` for review screens to render from; the send and multi-send
 *    screens read it today, and the remaining compose types still echo `result.params`. Asset
 *    divisibility is the one value still taken from the response, since it is a ledger fact rather
 *    than a property of the transaction — it moves the decimal point but not the recipient.
 *
 * **Known limitations.** Field-level verification does not cover values the server derives from
 * ledger state (a reissuance's divisibility and description, a newly created pool's LP asset);
 * those are guarded on presence and called out at their call sites. Compose types with no
 * field-level verifier report `fieldVerification: 'type-only'`.
 *
 * Uses compose.ts types directly and paramSchema.ts for criticality levels.
 */


// Import compose types directly
import type {
  CancelOptions,
  DestroyOptions,
  DispenserOptions,
  IssuanceOptions,
  OrderOptions,
  PoolDepositOptions,
  PoolWithdrawOptions,
  SendOptions,
  SweepOptions,
} from '@/utils/blockchain/counterparty/compose';
import { addressesEqual } from '@/utils/blockchain/counterparty/unpack/address';
import { MessageTypeId, type UnpackedMessageData, unpackCounterpartyMessage } from '@/utils/blockchain/counterparty/unpack/index';
import type { AttachData, DetachData, MoveData } from '@/utils/blockchain/counterparty/unpack/messages/attach';
import type { BroadcastData } from '@/utils/blockchain/counterparty/unpack/messages/broadcast';
import type { BTCPayData } from '@/utils/blockchain/counterparty/unpack/messages/btcpay';
import type { CancelData } from '@/utils/blockchain/counterparty/unpack/messages/cancel';
import type { DestroyData } from '@/utils/blockchain/counterparty/unpack/messages/destroy';
import type { DispenserData } from '@/utils/blockchain/counterparty/unpack/messages/dispenser';
import type { DividendData } from '@/utils/blockchain/counterparty/unpack/messages/dividend';
import type { EnhancedSendData } from '@/utils/blockchain/counterparty/unpack/messages/enhancedSend';
import type { FairmintData } from '@/utils/blockchain/counterparty/unpack/messages/fairmint';
import type { FairminterData } from '@/utils/blockchain/counterparty/unpack/messages/fairminter';
import type { IssuanceData } from '@/utils/blockchain/counterparty/unpack/messages/issuance';
import type { MPMAData } from '@/utils/blockchain/counterparty/unpack/messages/mpma';
import type { OrderData } from '@/utils/blockchain/counterparty/unpack/messages/order';
import type { PoolDepositData, PoolWithdrawData } from '@/utils/blockchain/counterparty/unpack/messages/pool';
import type { SendData } from '@/utils/blockchain/counterparty/unpack/messages/send';
import type { SweepData } from '@/utils/blockchain/counterparty/unpack/messages/sweep';
import { type Criticality, getMessageSchema } from '@/utils/blockchain/counterparty/unpack/paramSchema';

/**
 * Supported compose types for verification
 */
export type VerifiableComposeType =
  | 'send'
  | 'enhanced_send'
  | 'order'
  | 'dispenser'
  | 'cancel'
  | 'destroy'
  | 'sweep'
  | 'issuance'
  | 'pooldeposit'
  | 'poolwithdraw';

/**
 * Compose params - the params object from compose options
 * These match what the API returns in response.result.params
 */
export type ComposeParams =
  | Pick<SendOptions, 'destination' | 'asset' | 'quantity' | 'memo' | 'memo_is_hex'>
  | Pick<OrderOptions, 'give_asset' | 'give_quantity' | 'get_asset' | 'get_quantity' | 'expiration' | 'fee_required'>
  | Pick<DispenserOptions, 'asset' | 'give_quantity' | 'escrow_quantity' | 'mainchainrate' | 'status' | 'open_address' | 'oracle_address'>
  | Pick<CancelOptions, 'offer_hash'>
  | Pick<DestroyOptions, 'asset' | 'quantity' | 'tag'>
  | Pick<SweepOptions, 'destination' | 'flags' | 'memo'>
  | Pick<IssuanceOptions, 'asset' | 'quantity' | 'divisible' | 'lock' | 'reset' | 'transfer_destination' | 'description'>
  | Pick<PoolDepositOptions, 'asset_a' | 'asset_b' | 'quantity_a' | 'quantity_b' | 'min_lp_quantity' | 'lp_asset'>
  | Pick<PoolWithdrawOptions, 'asset_a' | 'asset_b' | 'quantity' | 'min_quantity_a' | 'min_quantity_b' | 'lp_asset'>;

/**
 * A mismatch found during verification
 */
export interface VerificationMismatch {
  /** Field name */
  field: string;
  /** Expected value (from request) */
  expected: unknown;
  /** Actual value (from transaction) */
  actual: unknown;
  /** How critical this mismatch is */
  criticality: Criticality;
  /** Human-readable description of the risk */
  riskDescription: string;
}

/**
 * Result of transaction verification
 */
export interface VerificationResult {
  /** Whether the transaction matches the request (no critical/dangerous mismatches) */
  valid: boolean;
  /** Critical mismatches (funds at risk) - blocks signing */
  criticalMismatches: VerificationMismatch[];
  /** Dangerous mismatches (harmful side effects) - blocks signing */
  dangerousMismatches: VerificationMismatch[];
  /** Informational mismatches (metadata differences) - warning only */
  infoMismatches: VerificationMismatch[];
  /** Legacy: all errors (critical + dangerous) */
  errors: string[];
  /** Legacy: all warnings (informational) */
  warnings: string[];
  /**
   * Whether the message's fields were compared against the request. 'type-only' means no
   * field-level verifier exists for the compose type: the message type was confirmed and nothing
   * else. That is an absence of checking, not a detected difference, so it is carried here rather
   * than in `warnings`, which surface to the user as differences.
   */
  fieldVerification: 'full' | 'type-only';
  /** The unpacked transaction data */
  unpacked?: UnpackedMessageData;
  /** The message type that was unpacked */
  messageType?: string;
  /** Expected values from the request */
  expected: Record<string, unknown>;
  /** Actual values from the transaction */
  actual: Record<string, unknown>;
}

/**
 * Normalize quantity to bigint for comparison
 */
function toBigInt(value: number | string | bigint | boolean | undefined | null): bigint | null {
  if (value === undefined || value === null) return 0n;
  if (typeof value === 'boolean') return value ? 1n : 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? BigInt(Math.floor(value)) : null;
  }
  try {
    return BigInt(value);
  } catch {
    // null, not 0n. Returning zero here conflated "could not read this" with "this is zero", and
    // that broke the comparison in both directions: one unreadable side produced a spurious
    // critical mismatch against a real quantity, and two unreadable sides compared equal and
    // certified each other as verified. A value we cannot read must never stand in for one we can.
    return null;
  }
}

/**
 * Interpret the spellings a boolean field arrives in — real booleans, the 0/1 the wire uses, and the
 * strings a form submits. Returns null for anything else, so an unrecognized value is never silently
 * coerced into a flag value.
 */
function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value !== 0n;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === '') return false;
  }
  return null;
}

/**
 * Compare two values, handling bigint/number/string conversions
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  // Absence: null, undefined and the empty string all mean "not provided". Form fields submit ""
  // for an input left blank, while unpackers report the same field as undefined — those must not
  // read as a difference. A present value against any absent one still does.
  const absent = (value: unknown) => value === null || value === undefined || value === '';
  if (absent(a) || absent(b)) {
    return absent(a) && absent(b);
  }

  // Handle booleans. Truthiness is not enough: Boolean('false') is true, so a flipped flag arriving
  // as a form string would have read as a match. Only recognized boolean spellings compare equal;
  // anything else is treated as a mismatch rather than coerced.
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const boolA = asBoolean(a);
    const boolB = asBoolean(b);
    return boolA !== null && boolB !== null && boolA === boolB;
  }

  // Handle numbers/bigints/strings that represent quantities
  if (typeof a === 'bigint' || typeof b === 'bigint' ||
      typeof a === 'number' || typeof b === 'number') {
    // Same shape as the boolean branch above: an unreadable value is never equal to anything,
    // including another unreadable one, so it is reported as a mismatch rather than a match.
    const numA = toBigInt(a as string | number | bigint);
    const numB = toBigInt(b as string | number | bigint);
    return numA !== null && numB !== null && numA === numB;
  }

  // Handle strings (addresses, assets, etc.)
  if (typeof a === 'string' && typeof b === 'string') {
    // A 64-char hex string is a hash (txid/offer_hash), not an address, even
    // when it happens to start with a base58-like character.
    const isHash = (s: string) => /^[0-9a-f]{64}$/i.test(s);
    if (!isHash(a) && !isHash(b) &&
        (a.startsWith('bc1') || a.startsWith('1') || a.startsWith('3') ||
         b.startsWith('bc1') || b.startsWith('1') || b.startsWith('3'))) {
      return addressesEqual(a, b);
    }
    // Case-insensitive comparison for assets/hashes
    return a.toLowerCase() === b.toLowerCase();
  }

  return a === b;
}

/**
 * Add a mismatch to the result
 */
function addMismatch(
  result: VerificationResult,
  field: string,
  expected: unknown,
  actual: unknown,
  criticality: Criticality,
  riskDescription: string
): void {
  const mismatch: VerificationMismatch = {
    field,
    expected,
    actual,
    criticality,
    riskDescription,
  };

  // Convert BigInt to string for JSON serialization
  const stringify = (val: unknown): string => {
    if (typeof val === 'bigint') return val.toString();
    return JSON.stringify(val);
  };
  // Capitalize field name for readability (e.g., 'asset' -> 'Asset mismatch')
  const capitalizedField = field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
  const message = `${capitalizedField} mismatch: expected ${stringify(expected)}, got ${stringify(actual)}`;

  switch (criticality) {
    case 'critical':
      result.criticalMismatches.push(mismatch);
      result.errors.push(`[CRITICAL] ${message}`);
      break;
    case 'dangerous':
      result.dangerousMismatches.push(mismatch);
      result.errors.push(`[DANGEROUS] ${message}`);
      break;
    case 'informational':
      result.infoMismatches.push(mismatch);
      result.warnings.push(message);
      break;
  }
}

/**
 * Compare a field the request may omit against what the message actually carries.
 *
 * Omitting a field is not the same as leaving it unchecked. A request that says nothing about
 * `open_address`, `lock` or `fee_required` is asking for the default — no address, no lock, no fee —
 * so a composed message carrying something else differs from what was requested and must be
 * reported. The old `if (params.x !== undefined)` guards skipped the comparison entirely, which is
 * how an injected value could pass as verified.
 *
 * Use this only where the default is genuinely known. Where an omitted field means "the server
 * fills this in from existing state" (a reissuance's divisibility, say), the value is not
 * predictable from the request and comparing it would reject honest transactions; those stay
 * explicitly guarded and are called out at their call sites.
 *
 * @param defaultWhenOmitted - What the composed message must carry when the request omits the field.
 *   Use `undefined` for "nothing at all" (addresses, memos) and `0` for numeric fields.
 */
function verifyOptional(
  result: VerificationResult,
  field: string,
  requested: unknown,
  actual: unknown,
  defaultWhenOmitted: unknown,
  criticality: Criticality,
  riskDescription: string
): void {
  const expected = requested === undefined ? defaultWhenOmitted : requested;
  if (!valuesEqual(actual, expected)) {
    addMismatch(result, field, expected, actual, criticality, riskDescription);
  }
}

/**
 * Verify send/enhanced_send transaction
 */
function verifySend(
  data: EnhancedSendData | SendData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  const schema = getMessageSchema('enhanced_send');
  if (!schema) return;

  // Asset - critical
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = lose wrong tokens');
  }

  // Quantity - critical
  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = lose more than intended');
  }

  // Destination - critical (for enhanced_send). A request with no destination cannot vouch for the
  // recipient the message carries, so that is a mismatch rather than a skipped check.
  if ('destination' in data) {
    verifyOptional(result, 'destination', params.destination, data.destination, undefined, 'critical',
      'Wrong address = funds sent to wrong recipient');
  }

  // Memo - informational. A memo the request never asked for is still a difference worth showing.
  if ('memo' in data) {
    verifyOptional(result, 'memo', params.memo, data.memo, undefined, 'informational',
      'Just metadata, no direct financial impact');
  }
}

/**
 * Verify a multi-destination send (composed as an MPMA message).
 *
 * The send form fans one asset+quantity out to a comma-separated destination
 * list, so every MPMA send must carry that same asset and quantity, the
 * recipient count must match exactly (no dropped or injected recipients), and
 * each destination must be one of the intended addresses.
 */
export function verifyMultiSend(
  data: MPMAData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  const intended = typeof params.destinations === 'string'
    ? params.destinations.split(',').map((d) => d.trim()).filter(Boolean)
    : [];

  if (intended.length === 0) {
    // The request carried no destination list, so nothing pins the composed recipients. This must
    // record a real mismatch (not a bare errors.push): valid is derived from criticalMismatches, so
    // a message substituting an MPMA that pays the attacker would otherwise verify as valid.
    addMismatch(result, 'destinations', 'an intended destination list', undefined, 'critical',
      'Cannot verify recipients: the request carried no destination list to check against');
    return;
  }

  if (data.sends.length !== intended.length) {
    addMismatch(result, 'recipient_count', intended.length, data.sends.length, 'critical',
      'Extra or missing recipients = funds sent to unintended parties');
    return;
  }

  // Consume each intended destination once so duplicates or substitutions are caught.
  const remaining = [...intended];
  for (const send of data.sends) {
    if (!valuesEqual(send.asset, params.asset)) {
      addMismatch(result, 'asset', params.asset, send.asset, 'critical',
        'Wrong asset = lose wrong tokens');
    }
    if (!valuesEqual(send.quantity, params.quantity)) {
      addMismatch(result, 'quantity', params.quantity, send.quantity, 'critical',
        'Wrong amount = lose more than intended');
    }
    const matchIdx = remaining.findIndex((address) => addressesEqual(address, send.destination));
    if (matchIdx === -1) {
      addMismatch(result, 'destination', intended, send.destination, 'critical',
        'Recipient not in the intended destination list');
    } else {
      remaining.splice(matchIdx, 1);
    }
  }
}

/**
 * Verify order transaction
 */
function verifyOrder(
  data: OrderData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Give asset - critical
  if (!valuesEqual(data.giveAsset, params.give_asset)) {
    addMismatch(result, 'give_asset', params.give_asset, data.giveAsset, 'critical',
      'Wrong asset = offering wrong tokens');
  }

  // Give quantity - critical
  if (!valuesEqual(data.giveQuantity, params.give_quantity)) {
    addMismatch(result, 'give_quantity', params.give_quantity, data.giveQuantity, 'critical',
      'Wrong amount = offering more than intended');
  }

  // Get asset - critical
  if (!valuesEqual(data.getAsset, params.get_asset)) {
    addMismatch(result, 'get_asset', params.get_asset, data.getAsset, 'critical',
      'Wrong asset = receiving wrong tokens');
  }

  // Get quantity - critical
  if (!valuesEqual(data.getQuantity, params.get_quantity)) {
    addMismatch(result, 'get_quantity', params.get_quantity, data.getQuantity, 'critical',
      'Wrong amount = bad exchange rate');
  }

  // Expiration - dangerous
  if (!valuesEqual(data.expiration, params.expiration)) {
    addMismatch(result, 'expiration', params.expiration, data.expiration, 'dangerous',
      'Too short = expires before fill, too long = funds locked longer');
  }

  // Fee required - dangerous. Omitted means no fee is being demanded on match, so an injected one
  // must be reported (core takes fee_required as a required parameter; the form sends 0 by default).
  verifyOptional(result, 'fee_required', params.fee_required, data.feeRequired, 0, 'dangerous',
    'Higher fee = lose more BTC on match');
}

/**
 * Verify dispenser transaction
 */
function verifyDispenser(
  data: DispenserData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Asset - critical
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = dispensing wrong tokens');
  }

  // Give quantity - critical
  if (!valuesEqual(data.giveQuantity, params.give_quantity)) {
    addMismatch(result, 'give_quantity', params.give_quantity, data.giveQuantity, 'critical',
      'Wrong amount = giving wrong amount per dispense');
  }

  // Escrow quantity - critical
  if (!valuesEqual(data.escrowQuantity, params.escrow_quantity)) {
    addMismatch(result, 'escrow_quantity', params.escrow_quantity, data.escrowQuantity, 'critical',
      'Wrong amount = locking wrong total amount');
  }

  // Mainchainrate - critical
  if (!valuesEqual(data.mainchainrate, params.mainchainrate)) {
    addMismatch(result, 'mainchainrate', params.mainchainrate, data.mainchainrate, 'critical',
      'Wrong rate = selling at wrong price');
  }

  // Status - dangerous. Opening a dispenser omits status (the compose layer defaults it to 0);
  // the close flows submit it explicitly. Either way the composed status must match, so a response
  // switching an open to status 1 (open-on-another-address) is reported.
  verifyOptional(result, 'status', params.status, data.status, 0, 'dangerous',
    'Wrong status = dispenser open when should be closed or vice versa');

  // Open address - dangerous. Core defaults this to none, so a message carrying one the request
  // never asked for would put the user's escrow on someone else's dispenser.
  verifyOptional(result, 'open_address', params.open_address, data.openAddress, undefined, 'dangerous',
    'Wrong address = someone else can refill/control dispenser');

  // Oracle address - dangerous. Same reasoning: an injected oracle lets a third party set the price.
  verifyOptional(result, 'oracle_address', params.oracle_address, data.oracleAddress, undefined, 'dangerous',
    'Wrong oracle = price determined by untrusted source');
}

/**
 * Verify cancel transaction
 */
function verifyCancel(
  data: CancelData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Offer hash - critical
  if (!valuesEqual(data.offerHash, params.offer_hash)) {
    addMismatch(result, 'offer_hash', params.offer_hash, data.offerHash, 'critical',
      'Wrong hash = cancelling wrong order/offer');
  }
}

/**
 * Verify destroy transaction
 */
function verifyDestroy(
  data: DestroyData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Asset - critical
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = destroying wrong tokens');
  }

  // Quantity - critical
  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = destroying more than intended');
  }

  // Tag - informational
  verifyOptional(result, 'tag', params.tag, data.tag, undefined, 'informational',
    'Just a label, no financial impact');
}

/**
 * Verify sweep transaction
 */
function verifySweep(
  data: SweepData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Destination - critical
  if (!valuesEqual(data.destination, params.destination)) {
    addMismatch(result, 'destination', params.destination, data.destination, 'critical',
      'Wrong address = all assets sent to wrong recipient');
  }

  // Flags - dangerous
  if (!valuesEqual(data.flags, params.flags)) {
    addMismatch(result, 'flags', params.flags, data.flags, 'dangerous',
      'Controls what gets swept (balances, ownerships, etc.)');
  }

  // Memo - informational
  verifyOptional(result, 'memo', params.memo, data.memo, undefined, 'informational',
    'Just metadata, no direct financial impact');
}

/**
 * Verify issuance transaction
 */
function verifyIssuance(
  data: IssuanceData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Asset - critical.
  //
  // A subasset message names its asset twice: `asset` is the numeric name the id resolves to
  // (A123…), and `subassetLongname` is the PARENT.child the user actually typed. Comparing the
  // request's longname against the numeric name flags every honest subasset issuance as a
  // critical mismatch, so the longname is what gets compared when the message carries one.
  const requested = params.asset;
  const composed = data.subassetLongname ?? data.asset;
  if (!valuesEqual(composed, requested)) {
    addMismatch(result, 'asset', requested, composed, 'critical',
      'Wrong asset name = creating/modifying wrong asset');
  }

  // Quantity - critical
  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = issuing wrong supply');
  }

  // Divisible - dangerous (permanent on first issuance).
  //
  // Deliberately still guarded on presence, unlike the optional fields elsewhere in this file: a
  // reissuance (update-description, transfer-ownership) omits `divisible`, and the composed message
  // then carries the asset's existing divisibility, which the request cannot predict. Comparing an
  // omitted value against a fixed default would reject honest reissuances of divisible assets.
  // The cost is that divisibility goes unverified on those flows — see KNOWN COVERAGE GAPS below.
  if (params.divisible !== undefined) {
    if (!valuesEqual(data.divisible, params.divisible)) {
      addMismatch(result, 'divisible', params.divisible, data.divisible, 'dangerous',
        'PERMANENT: Cannot change divisibility after creation');
    }
  }

  // Lock/reset - dangerous (lock is permanent; reset destroys existing holdings). Absent means the
  // user did not ask for it, so a composed lock/reset is flagged even when the request omits the
  // field: update-description and transfer-ownership submit neither, and an API-injected lock must
  // not pass unchecked. Compared one-sided against the safe default of false.
  const wantLock = params.lock === true;
  if (wantLock !== Boolean(data.isLock)) {
    addMismatch(result, 'lock', wantLock, Boolean(data.isLock), 'dangerous',
      'PERMANENT: Locks supply forever, cannot issue more');
  }

  const wantReset = params.reset === true;
  if (wantReset !== Boolean(data.isReset)) {
    addMismatch(result, 'reset', wantReset, Boolean(data.isReset), 'dangerous',
      'DESTRUCTIVE: Resets asset, existing holders lose tokens');
  }

  // Transfer destination - critical (if specified)
  if (params.transfer_destination) {
    // Note: transfer_destination is in the Bitcoin outputs, not OP_RETURN
    // We can't verify this from the unpacked message alone
    // This would need to be checked against the transaction outputs
  }

  // Description - informational. Guarded on presence for the same reason as `divisible`: a
  // reissuance that omits it carries the asset's existing description forward, which the request
  // cannot predict.
  if (params.description !== undefined) {
    if (!valuesEqual(data.description, params.description)) {
      addMismatch(result, 'description', params.description, data.description, 'informational',
        'Asset description, visible but not financial');
    }
  }
}

/**
 * Verify a dividend. Every field is critical: the asset paid on decides who receives, the asset
 * paid in decides what leaves, and the per-unit quantity multiplies across every holder — a raised
 * value drains the issuer's balance proportionally.
 */
function verifyDividend(
  data: DividendData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = paying holders of an asset you did not choose');
  }

  if (!valuesEqual(data.dividendAsset, params.dividend_asset)) {
    addMismatch(result, 'dividend_asset', params.dividend_asset, data.dividendAsset, 'critical',
      'Wrong asset = paying out tokens you did not intend to spend');
  }

  if (!valuesEqual(data.quantityPerUnit, params.quantity_per_unit)) {
    addMismatch(result, 'quantity_per_unit', params.quantity_per_unit, data.quantityPerUnit,
      'critical', 'Higher per-unit amount multiplies across every holder');
  }
}

/** Verify a fairmint: which asset is being minted, and how much. */
function verifyFairmint(
  data: FairmintData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = minting from a different fairminter');
  }

  // Some fairminters are free-quantity; an omitted request quantity means "whatever the fairminter
  // sets", which the request does not pin.
  if (params.quantity !== undefined) {
    if (!valuesEqual(data.quantity, params.quantity)) {
      addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
        'Wrong amount = paying for a different quantity than intended');
    }
  }
}

/** Verify a BTCPay settles the order match that was requested. */
function verifyBTCPay(
  data: BTCPayData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (!valuesEqual(data.orderMatchId, params.order_match_id)) {
    addMismatch(result, 'order_match_id', params.order_match_id, data.orderMatchId, 'critical',
      'Wrong match = paying BTC against an order you did not agree to');
  }
}

/** Verify an attach binds the intended asset and amount to the intended output. */
function verifyAttach(
  data: AttachData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = attaching tokens you did not choose');
  }

  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = attaching more than intended');
  }

  // The vout decides which output owns the assets afterwards, so a substituted one hands them to
  // whoever controls that output.
  verifyOptional(result, 'destination_vout', params.destination_vout, data.destinationVout,
    undefined, 'critical', 'Wrong output = assets attached to a UTXO you do not control');
}

/** Verify a detach releases assets to the intended address. */
function verifyDetach(
  data: DetachData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Core encodes "back to the sender" as "0"; a request that names no destination means exactly
  // that, so only a named destination is compared.
  if (params.destination !== undefined && data.destination !== '0') {
    if (!valuesEqual(data.destination, params.destination)) {
      addMismatch(result, 'destination', params.destination, data.destination, 'critical',
        'Wrong address = detached assets sent to the wrong recipient');
    }
  } else if (params.destination === undefined && data.destination !== '0') {
    addMismatch(result, 'destination', 'your own address', data.destination, 'critical',
      'Assets detached to an address your request did not name');
  }
}

/**
 * Verify a broadcast publishes what was written. When the caller supplies no timestamp,
 * `composeBroadcast` stamps the wallet's own clock into the request, so a decoded timestamp far
 * in the future can only be a substitution.
 */
function verifyBroadcast(
  data: BroadcastData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (params.text !== undefined && !valuesEqual(data.text, params.text)) {
    addMismatch(result, 'text', params.text, data.text, 'critical',
      'Different text = publishing something you did not write');
  }

  // Same bound as the packer's borrowed-timestamp limit (`pack/messages.ts`). Bets settle once a
  // broadcast's timestamp reaches their deadline, so a substituted future timestamp settles a
  // feed's open bets early.
  if (params.timestamp === undefined && typeof data.timestamp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (data.timestamp > now + 3600) {
      addMismatch(result, 'timestamp', 'the wallet clock at compose time', data.timestamp, 'critical',
        'A future timestamp settles bets against this feed before their deadline');
    }
  }

  verifyOptional(result, 'value', params.value, data.value, 0, 'dangerous',
    'A feed value drives bets settled against this broadcast');

  verifyOptional(result, 'fee_fraction', params.fee_fraction, data.feeFractionInt, 0, 'dangerous',
    'Fee fraction is taken from bets settled against this feed');
}

/**
 * Verify a move of assets between UTXOs.
 *
 * The destination decides which UTXO owns the assets afterwards and is the one field the request
 * names. Asset and quantity are filled in by the composer from whatever the source UTXO holds, so
 * the request does not pin them.
 */
function verifyMove(
  data: MoveData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (!valuesEqual(data.destination, params.destination)) {
    addMismatch(result, 'destination', params.destination, data.destination, 'critical',
      'Wrong destination = assets moved to a UTXO you do not control');
  }
}

/**
 * Verify a fairminter — the terms of a public mint, which anyone can then pay into.
 *
 * The form's names differ from the wire's (`lot_price` is `price`, `lot_size` is
 * `quantity_by_price`), and omitted fields take the defaults `composeFairminter` applies, so the
 * defaults below must stay in step with that function. Two are not zero: a lot size of 1 and
 * divisible true.
 *
 * The commission arrives as a decimal fraction and travels as an integer:
 * `minted_asset_commission_int = int(minted_asset_commission * 1e8)` (core `fairminter.py`). Both
 * sides use IEEE-754 doubles and truncate, so the same arithmetic reproduces it exactly.
 */
function verifyFairminter(
  data: FairminterData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = creating a mint for something you do not own');
  }

  // What a buyer pays and what they get for it.
  verifyOptional(result, 'lot_price', params.lot_price, data.price, 0, 'critical',
    'Wrong price = minters pay an amount you did not set');
  verifyOptional(result, 'lot_size', params.lot_size, data.quantityByPrice, 1, 'critical',
    'Wrong lot size = minters receive a quantity you did not set');

  // Supply the issuer is committing, and what they keep.
  verifyOptional(result, 'hard_cap', params.hard_cap, data.hardCap, 0, 'critical',
    'Wrong cap = more supply mintable than intended');
  verifyOptional(result, 'premint_quantity', params.premint_quantity, data.premintQuantity, 0,
    'critical', 'Premint issues supply to the creator before the mint opens');

  verifyOptional(result, 'divisible', params.divisible, data.divisible, true, 'dangerous',
    'PERMANENT: Cannot change divisibility after creation');

  verifyOptional(result, 'max_mint_per_tx', params.max_mint_per_tx, data.maxMintPerTx, 0,
    'dangerous', 'Per-transaction limit shapes who can take the supply');
  verifyOptional(result, 'max_mint_per_address', params.max_mint_per_address,
    data.maxMintPerAddress, 0, 'dangerous', 'Per-address limit shapes who can take the supply');
  verifyOptional(result, 'start_block', params.start_block, data.startBlock, 0, 'dangerous',
    'Wrong start = the mint opens at a time you did not choose');
  verifyOptional(result, 'end_block', params.end_block, data.endBlock, 0, 'dangerous',
    'Wrong end = the mint runs longer or shorter than intended');
  verifyOptional(result, 'soft_cap', params.soft_cap, data.softCap, 0, 'dangerous',
    'Soft cap decides whether the mint refunds or completes');
  verifyOptional(result, 'soft_cap_deadline_block', params.soft_cap_deadline_block,
    data.softCapDeadlineBlock, 0, 'dangerous', 'Deadline decides when the soft cap is judged');
  verifyOptional(result, 'burn_payment', params.burn_payment, data.burnPayment, false, 'dangerous',
    'Burning payment destroys what minters pay instead of paying you');
  verifyOptional(result, 'lock_description', params.lock_description, data.lockDescription, false,
    'dangerous', 'PERMANENT: description can never be changed again');
  verifyOptional(result, 'lock_quantity', params.lock_quantity, data.lockQuantity, false,
    'dangerous', 'PERMANENT: supply can never be increased again');
  verifyOptional(result, 'pool_quantity', params.pool_quantity, data.poolQuantity, 0, 'dangerous',
    'Pool quantity diverts supply into a liquidity pool');

  // The creator's cut of every mint, scaled to an integer the same way core scales it.
  const requestedCommission = params.minted_asset_commission;
  const commissionInt = requestedCommission === undefined
    ? 0
    : Math.trunc(Number(requestedCommission) * 1e8);
  if (Number.isFinite(commissionInt) && !valuesEqual(data.mintedAssetCommissionInt, commissionInt)) {
    addMismatch(result, 'minted_asset_commission', requestedCommission ?? 0,
      data.mintedAssetCommissionInt, 'critical',
      'Commission is the creator\'s cut of every mint');
  }

  verifyOptional(result, 'description', params.description, data.description, undefined,
    'informational', 'Asset description, visible but not financial');
}

function verifyPoolDeposit(
  data: PoolDepositData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  if (!valuesEqual(data.assetA, params.asset_a)) {
    addMismatch(result, 'asset_a', params.asset_a, data.assetA, 'critical',
      'Wrong asset = depositing wrong tokens');
  }

  if (!valuesEqual(data.assetB, params.asset_b)) {
    addMismatch(result, 'asset_b', params.asset_b, data.assetB, 'critical',
      'Wrong asset = depositing wrong tokens');
  }

  if (!valuesEqual(data.quantityA, params.quantity_a)) {
    addMismatch(result, 'quantity_a', params.quantity_a, data.quantityA, 'critical',
      'Wrong amount = depositing more than intended');
  }

  if (!valuesEqual(data.quantityB, params.quantity_b)) {
    addMismatch(result, 'quantity_b', params.quantity_b, data.quantityB, 'critical',
      'Wrong amount = depositing more than intended');
  }

  // Omitting a slippage minimum means asking for none, so a composed minimum that differs is a
  // difference from the request — most importantly a lowered one, which weakens the protection.
  verifyOptional(result, 'min_lp_quantity', params.min_lp_quantity, data.minLpQuantity, 0, 'dangerous',
    'Lower minimum = weaker slippage protection');

  // lp_asset stays guarded on presence: when the deposit creates a new pool the LP token is derived
  // server-side, so an omitted request value has no predictable default to compare against.
  if (params.lp_asset !== undefined && data.lpAsset && !valuesEqual(data.lpAsset, params.lp_asset)) {
    addMismatch(result, 'lp_asset', params.lp_asset, data.lpAsset, 'dangerous',
      'Wrong LP asset = creates or references an unintended pool token');
  }
}

function verifyPoolWithdraw(
  data: PoolWithdrawData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // The pool being withdrawn from identifies where the funds come from, so it is compared
  // unconditionally — as pool deposit already does. A request that names no pool cannot vouch for
  // the one the message carries.
  if (!valuesEqual(data.assetA, params.asset_a)) {
    addMismatch(result, 'asset_a', params.asset_a, data.assetA, 'critical',
      'Wrong asset = withdrawing from wrong pool');
  }

  if (!valuesEqual(data.assetB, params.asset_b)) {
    addMismatch(result, 'asset_b', params.asset_b, data.assetB, 'critical',
      'Wrong asset = withdrawing from wrong pool');
  }

  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = burning more LP tokens than intended');
  }

  verifyOptional(result, 'min_quantity_a', params.min_quantity_a, data.minQuantityA, 0, 'dangerous',
    'Lower minimum = weaker slippage protection');

  verifyOptional(result, 'min_quantity_b', params.min_quantity_b, data.minQuantityB, 0, 'dangerous',
    'Lower minimum = weaker slippage protection');
}

/**
 * Compose types whose message is named differently on the wire. Types not listed here use the
 * compose type as the message type name.
 */
const COMPOSE_TYPE_MESSAGE_NAMES: Record<string, string> = {
  mpma: 'mpma_send',
  move: 'utxo',
};

/**
 * Verify a composed transaction matches the request params.
 *
 * Supports two call signatures for backward compatibility:
 * - verifyTransaction(opReturnData, composeType, params) - new API
 * - verifyTransaction(opReturnData, { type, params }) - legacy API
 *
 * @param opReturnData - The OP_RETURN data from the transaction (hex or bytes)
 * @param composeTypeOrRequest - The compose type string OR a legacy request object
 * @param params - The params (only for new API)
 * @returns Verification result with any mismatches found
 */
export function verifyTransaction(
  opReturnData: string | Uint8Array,
  composeTypeOrRequest: VerifiableComposeType | string | ComposeRequest,
  params?: Record<string, unknown>
): VerificationResult {
  // Handle legacy API: verifyTransaction(data, { type, params })
  let composeType: string;
  let actualParams: Record<string, unknown>;

  if (typeof composeTypeOrRequest === 'object' && 'type' in composeTypeOrRequest) {
    // Legacy call signature
    composeType = composeTypeOrRequest.type;
    actualParams = composeTypeOrRequest.params;
  } else {
    // New call signature
    composeType = composeTypeOrRequest as string;
    actualParams = params || {};
  }
  const result: VerificationResult = {
    valid: false,
    criticalMismatches: [],
    dangerousMismatches: [],
    infoMismatches: [],
    errors: [],
    warnings: [],
    fieldVerification: 'full',
    expected: actualParams,
    actual: {},
  };

  // Unpack the transaction
  const unpacked = unpackCounterpartyMessage(opReturnData);

  if (!unpacked.success || !unpacked.data) {
    result.errors.push(unpacked.error || 'Failed to unpack transaction');
    return result;
  }

  result.unpacked = unpacked.data;
  result.messageType = unpacked.messageType;
  result.actual = unpacked.data as Record<string, unknown>;

  // Verify based on compose type
  switch (composeType) {
    case 'send':
    case 'enhanced_send':
      // A multi-destination send composes to an MPMA message; verify it as one.
      if (unpacked.messageTypeId === MessageTypeId.MPMA_SEND) {
        verifyMultiSend(unpacked.data as MPMAData, actualParams, result);
        break;
      }
      if (unpacked.messageTypeId !== MessageTypeId.ENHANCED_SEND &&
          unpacked.messageTypeId !== MessageTypeId.SEND) {
        result.errors.push(`Message type mismatch: expected send, got ${unpacked.messageType}`);
        return result;
      }
      verifySend(unpacked.data as EnhancedSendData | SendData, actualParams, result);
      break;

    case 'order':
      if (unpacked.messageTypeId !== MessageTypeId.ORDER) {
        result.errors.push(`Message type mismatch: expected order, got ${unpacked.messageType}`);
        return result;
      }
      verifyOrder(unpacked.data as OrderData, actualParams, result);
      break;

    case 'dispenser':
      if (unpacked.messageTypeId !== MessageTypeId.DISPENSER) {
        result.errors.push(`Message type mismatch: expected dispenser, got ${unpacked.messageType}`);
        return result;
      }
      verifyDispenser(unpacked.data as DispenserData, actualParams, result);
      break;

    case 'cancel':
      if (unpacked.messageTypeId !== MessageTypeId.CANCEL) {
        result.errors.push(`Message type mismatch: expected cancel, got ${unpacked.messageType}`);
        return result;
      }
      verifyCancel(unpacked.data as CancelData, actualParams, result);
      break;

    case 'dividend':
      if (unpacked.messageTypeId !== MessageTypeId.DIVIDEND) {
        result.errors.push(`Message type mismatch: expected dividend, got ${unpacked.messageType}`);
        return result;
      }
      verifyDividend(unpacked.data as DividendData, actualParams, result);
      break;

    case 'fairmint':
      if (unpacked.messageTypeId !== MessageTypeId.FAIRMINT) {
        result.errors.push(`Message type mismatch: expected fairmint, got ${unpacked.messageType}`);
        return result;
      }
      verifyFairmint(unpacked.data as FairmintData, actualParams, result);
      break;

    case 'btcpay':
      if (unpacked.messageTypeId !== MessageTypeId.BTC_PAY) {
        result.errors.push(`Message type mismatch: expected btcpay, got ${unpacked.messageType}`);
        return result;
      }
      verifyBTCPay(unpacked.data as BTCPayData, actualParams, result);
      break;

    case 'attach':
      if (unpacked.messageTypeId !== MessageTypeId.UTXO_ATTACH) {
        result.errors.push(`Message type mismatch: expected attach, got ${unpacked.messageType}`);
        return result;
      }
      verifyAttach(unpacked.data as AttachData, actualParams, result);
      break;

    case 'detach':
      if (unpacked.messageTypeId !== MessageTypeId.UTXO_DETACH) {
        result.errors.push(`Message type mismatch: expected detach, got ${unpacked.messageType}`);
        return result;
      }
      verifyDetach(unpacked.data as DetachData, actualParams, result);
      break;

    case 'move':
      if (unpacked.messageTypeId !== MessageTypeId.UTXO) {
        result.errors.push(`Message type mismatch: expected utxo, got ${unpacked.messageType}`);
        return result;
      }
      verifyMove(unpacked.data as MoveData, actualParams, result);
      break;

    case 'fairminter':
      if (unpacked.messageTypeId !== MessageTypeId.FAIRMINTER) {
        result.errors.push(`Message type mismatch: expected fairminter, got ${unpacked.messageType}`);
        return result;
      }
      verifyFairminter(unpacked.data as FairminterData, actualParams, result);
      break;

    case 'broadcast':
      if (unpacked.messageTypeId !== MessageTypeId.BROADCAST) {
        result.errors.push(`Message type mismatch: expected broadcast, got ${unpacked.messageType}`);
        return result;
      }
      verifyBroadcast(unpacked.data as BroadcastData, actualParams, result);
      break;

    case 'destroy':
      if (unpacked.messageTypeId !== MessageTypeId.DESTROY) {
        result.errors.push(`Message type mismatch: expected destroy, got ${unpacked.messageType}`);
        return result;
      }
      verifyDestroy(unpacked.data as DestroyData, actualParams, result);
      break;

    case 'sweep':
      if (unpacked.messageTypeId !== MessageTypeId.SWEEP) {
        result.errors.push(`Message type mismatch: expected sweep, got ${unpacked.messageType}`);
        return result;
      }
      verifySweep(unpacked.data as SweepData, actualParams, result);
      break;

    case 'issuance':
      if (unpacked.messageTypeId !== MessageTypeId.ISSUANCE &&
          unpacked.messageTypeId !== MessageTypeId.SUBASSET_ISSUANCE &&
          unpacked.messageTypeId !== MessageTypeId.LR_ISSUANCE &&
          unpacked.messageTypeId !== MessageTypeId.LR_SUBASSET) {
        result.errors.push(`Message type mismatch: expected issuance, got ${unpacked.messageType}`);
        return result;
      }
      verifyIssuance(unpacked.data as IssuanceData, actualParams, result);
      break;

    case 'pooldeposit':
      if (unpacked.messageTypeId !== MessageTypeId.POOL_DEPOSIT) {
        result.errors.push(`Message type mismatch: expected pooldeposit, got ${unpacked.messageType}`);
        return result;
      }
      verifyPoolDeposit(unpacked.data as PoolDepositData, actualParams, result);
      break;

    case 'poolwithdraw':
      if (unpacked.messageTypeId !== MessageTypeId.POOL_WITHDRAW) {
        result.errors.push(`Message type mismatch: expected poolwithdraw, got ${unpacked.messageType}`);
        return result;
      }
      verifyPoolWithdraw(unpacked.data as PoolWithdrawData, actualParams, result);
      break;

    default: {
      // No field-level verifier exists for this compose type, so its fields go unchecked. The
      // message type must still be the one that was requested, or a response substituting any
      // other message — a sweep, say — would be reported as verified.
      const expectedMessageType = COMPOSE_TYPE_MESSAGE_NAMES[composeType] ?? composeType;
      if (unpacked.messageType !== expectedMessageType) {
        result.errors.push(
          `Message type mismatch: expected ${expectedMessageType}, got ${unpacked.messageType}`
        );
        return result;
      }
      result.fieldVerification = 'type-only';
      result.valid = true;
      return result;
    }
  }

  // Transaction is valid if no critical or dangerous mismatches. `errors` is also required empty as
  // a backstop: a verifier that pushes a critical error directly (bypassing addMismatch, so
  // criticalMismatches stays empty) must not read as valid. addMismatch keeps the two in sync, so
  // this never rejects a transaction that has no critical/dangerous mismatch.
  result.valid = result.criticalMismatches.length === 0 &&
                 result.dangerousMismatches.length === 0 &&
                 result.errors.length === 0;

  return result;
}

/**
 * Legacy interface for backward compatibility
 */
export interface ComposeRequest {
  type: VerifiableComposeType;
  params: Record<string, unknown>;
}

/**
 * Legacy verify function for backward compatibility
 */
export function verifyTransactionLegacy(
  opReturnData: string | Uint8Array,
  request: ComposeRequest
): VerificationResult {
  return verifyTransaction(opReturnData, request.type, request.params);
}

