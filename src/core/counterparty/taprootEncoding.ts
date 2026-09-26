/**
 * When the wallet's own compose flows ask Counterparty for Taproot data encoding.
 *
 * Counterparty's default ("auto") encoding puts a message in an OP_RETURN when the message plus
 * the 8-byte CNTRPRTY prefix fits in 80 bytes, and in bare multisig outputs otherwise
 * (`api/composer.py`, `determine_encoding`). Bare multisig is expensive: every 62 bytes of data
 * costs a dust-sized output that is rarely spent. Taproot encoding instead commits to an envelope
 * in a P2TR output and publishes it in a pre-signed reveal, which is two transactions but, for a
 * message too long for an OP_RETURN, far cheaper. Measured against api.counterparty.io:
 *
 *   - message <= 72 bytes: OP_RETURN costs 316-400 sats at 2 sat/vB, Taproot ~636. Taproot loses.
 *   - message > 72 bytes: a 10-recipient MPMA at 10 sat/vB costs 30,050 sats through multisig and
 *     about 3,000 through Taproot.
 *
 * So the rule is exactly: Taproot when core would otherwise fall back to multisig, and only where
 * core allows it. It is never offered as a choice; the user sees only the cheaper transaction.
 *
 * Core refuses `encoding=taproot` when the source is not a native SegWit or Taproot address, when
 * the source is a UTXO, when the message has destination outputs, and for detach. The type list
 * below is the set of messages that carry everything in the data (no destination outputs); the
 * conditional cases are the ones whose compose adds an output depending on parameters.
 */

import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { CounterpartyApiError, UnofferedInputsError } from '@/core/errors';
import { validateBitcoinAddress } from '@/core/validation/bitcoin';

/** `config.OP_RETURN_MAX_SIZE` (80) less the 8-byte CNTRPRTY prefix. */
export const OP_RETURN_MESSAGE_MAX_BYTES = 72;

/** The CNTRPRTY prefix `packComposeMessage` includes and core's length test excludes. */
const PREFIX_BYTES = 8;

/** Output types core's `is_segwit_address` accepts (`script.is_segwit_output`). */
const TAPROOT_SOURCE_FORMATS = new Set(['P2WPKH', 'P2WSH', 'P2TR']);

type Params = Record<string, unknown>;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Whether core accepts `encoding=taproot` from this source. */
export function isTaprootEncodingSource(sourceAddress: string): boolean {
  if (typeof sourceAddress !== 'string' || sourceAddress.includes(':')) return false;
  const result = validateBitcoinAddress(sourceAddress);
  return result.isValid && TAPROOT_SOURCE_FORMATS.has(result.addressFormat ?? '');
}

/**
 * Whether a message of this type, with these parameters, has no destination outputs, so core
 * would accept Taproot encoding for it.
 */
export function isTaprootEligibleMessage(composeType: string, params: Params, sourceAddress: string): boolean {
  switch (composeType) {
    case 'send':
      // An enhanced send (or an MPMA, for several destinations) carries its recipient in the data.
      // A BTC send carries no message at all.
      return nonEmptyString(params.asset)?.toUpperCase() !== 'BTC';
    case 'mpma':
    case 'broadcast':
    case 'fairminter':
    case 'fairmint':
    case 'order':
    case 'cancel':
    case 'destroy':
    case 'dividend':
    case 'sweep':
    case 'pooldeposit':
    case 'poolwithdraw':
      return true;
    case 'issuance':
      // An ownership transfer names the new owner in an output ahead of the data.
      return nonEmptyString(params.transfer_destination) === null;
    case 'dispenser': {
      // Opening on another address funds that address with an output; an oracle dispenser may pay
      // the oracle's fee in an output.
      const openAddress = nonEmptyString(params.open_address);
      if (openAddress !== null && openAddress !== sourceAddress) return false;
      return nonEmptyString(params.oracle_address) === null;
    }
    // dispense and btcpay pay an address; burn pays the burn address; attach, detach and moves
    // either pay an output or spend a UTXO source. Everything unknown stays on the default.
    default:
      return false;
  }
}

/**
 * The encoding to request for a compose, or undefined to leave core's default in place.
 *
 * `messageLength` is the packed message's length with the CNTRPRTY prefix, as
 * `packComposeMessage` returns it; null when it could not be packed locally, which never switches.
 */
export function chooseEncoding(input: {
  composeType: string;
  params: Params;
  sourceAddress: string;
  messageLength: number | null;
}): 'taproot' | undefined {
  const { composeType, params, sourceAddress, messageLength } = input;
  // An explicit choice (the inscription forms) and an inscription request are left alone: the
  // forms that inscribe choose their own encoding, and an inscription changes the envelope core
  // builds.
  if (nonEmptyString(params.encoding) !== null || params.inscription) return undefined;
  if (messageLength === null || !Number.isFinite(messageLength)) return undefined;
  if (messageLength - PREFIX_BYTES <= OP_RETURN_MESSAGE_MAX_BYTES) return undefined;
  if (!isTaprootEncodingSource(sourceAddress)) return undefined;
  if (!isTaprootEligibleMessage(composeType, params, sourceAddress)) return undefined;
  return 'taproot';
}

/**
 * Values that fix the length of a message whose content core decides, for measuring it only.
 *
 * A broadcast without an explicit timestamp is stamped by `composeBroadcast` just before the
 * request, and a reissuance takes its divisibility from the ledger. Neither changes the packed
 * length (a current timestamp is always a 4-byte CBOR integer, a boolean always one byte), so the
 * length can be measured before compose. Nothing here reaches verification, which borrows the
 * real values from the composed message.
 */
function lengthProbe(): Params {
  return { timestamp: Math.floor(Date.now() / 1000), divisible: true };
}

/** `chooseEncoding` with the message length measured from the request itself. */
export function chooseComposeEncoding(composeType: string, params: Params, sourceAddress: string): 'taproot' | undefined {
  let messageLength: number | null = null;
  try {
    messageLength = packComposeMessage(composeType, params, lengthProbe())?.bytes.length ?? null;
  } catch {
    messageLength = null;
  }
  return chooseEncoding({ composeType, params, sourceAddress, messageLength });
}

/**
 * Whether a failed Taproot compose should be retried on core's default encoding.
 *
 * A composer rejection is an ordinary API error; the user asked for a transaction, not an
 * encoding, so a request the composer will not build as Taproot is built the default way instead.
 * A response that spent inputs it was never offered is a verification failure, not a rejection,
 * and is never retried.
 */
export function shouldRetryWithDefaultEncoding(error: unknown): boolean {
  return error instanceof CounterpartyApiError && !(error instanceof UnofferedInputsError);
}

/**
 * Compose with the chosen encoding, once, and fall back to the default if the composer refuses.
 */
export async function composeWithEncoding<R>(
  compose: (data: Params) => Promise<R>,
  data: Params,
  encoding: 'taproot' | undefined,
  signal?: AbortSignal,
): Promise<R> {
  if (!encoding) return compose(data);
  try {
    return await compose({ ...data, encoding });
  } catch (error) {
    if (signal?.aborted || !shouldRetryWithDefaultEncoding(error)) throw error;
    return compose(data);
  }
}
