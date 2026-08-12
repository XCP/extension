/**
 * Transaction Safety Analysis
 *
 * Analyzes decoded Counterparty transactions for security risks before signing.
 * Detects dangerous message types (sweep, destroy) and suspicious outputs
 * that could indicate a malicious site trying to drain the wallet.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { getSourcePubkey } from '@/core/counterparty/sourcePubkey';
import { bareMultisigRecoveryPubkey } from '@/core/counterparty/unpack/multisig';

/** Severity of a security warning */
export type WarningSeverity = 'block' | 'danger' | 'warning' | 'info';

/** A single security warning */
export interface SecurityWarning {
  severity: WarningSeverity;
  title: string;
  message: string;
}

/** Full safety analysis result */
export interface SafetyAnalysis {
  /** Whether signing should be blocked entirely */
  blocked: boolean;
  /** All warnings found, sorted by severity */
  warnings: SecurityWarning[];
}

/** Transaction output for analysis */
export interface AnalyzableOutput {
  value: number;
  address?: string;
  type: string;
  /** Raw scriptPubKey hex when the parser kept it (bare multisig has no address). */
  script?: string;
}

/**
 * Counterparty's bare-multisig data encoding: 1-of-2 or 1-of-3 with 33-byte
 * pushes, where the payload rides in the fake keys and the last key is the
 * sender's real pubkey (which is what makes the sats recoverable later).
 */
const CP_MULTISIG_DATA_SCRIPT = /^51(21[0-9a-f]{66}){2,3}5[23]ae$/i;

/**
 * True when the script matches the Counterparty multisig data-encoding shape.
 *
 * The embedded recovery key is checked separately: compose accepts a
 * `multisig_pubkey` override, so a hostile composer could point the recovery
 * key — and every data output's dust with it — at a key that is not the
 * signer's. `analyzeTransactionSafety` compares the third slot against the
 * signer's own pubkey wherever the wallet holds that address, and the wallet's
 * own compose path refuses the mismatch outright (`outputPolicy.ts`, which can
 * be exact because that path also *sent* the key).
 */
export function isCounterpartyDataScript(script: string | undefined): boolean {
  return !!script && CP_MULTISIG_DATA_SCRIPT.test(script);
}

/**
 * Message types whose whole purpose is to pay BTC to somebody else's address: a dispense pays the
 * dispenser, a BTCPay settles an order match. Flagging that payment as suspicious would fire on
 * every correct transaction of these types.
 */
const BTC_PAYING_MESSAGE_TYPES = new Set(['dispense', 'btcpay']);

/**
 * Message types that are too dangerous to sign via a provider/dApp request.
 * These can cause irreversible loss of all assets.
 */
const BLOCKED_MESSAGE_TYPES = new Set([
  'sweep', // Sends ALL Counterparty balances to a destination — wallet drain
]);

/**
 * Message types that warrant a strong danger warning but aren't blocked.
 * User can still proceed but should review very carefully.
 */
const DANGEROUS_MESSAGE_TYPES = new Set([
  'destroy', // Permanently burns assets — irreversible
]);

/**
 * Types that move everything they touch, so the amount is not stated in the message.
 *
 * `detach` credits EVERY balance on the source UTXO to the destination (core detach.py iterates
 * `get_utxo_balances` and debits each one), which is sweep semantics scoped to a UTXO. It sat in
 * the safe list, so a message that empties a UTXO to an address of the sender's choosing raised
 * nothing at all — while `sweep`, the same idea at address scope, is blocked outright. Blocking is
 * too strong here because the scope is one UTXO and a detach with no valid destination simply
 * credits back to the UTXO's own address; a warning that names the destination is the right
 * treatment.
 */
const MOVES_EVERYTHING_MESSAGE_TYPES = new Set(['detach']);

/**
 * Message types considered safe/normal for provider signing.
 */
const SAFE_MESSAGE_TYPES = new Set([
  'enhanced_send',
  'send',
  'order',
  'cancel',
  'dispenser',
  'dispense',
  'issuance',
  'subasset_issuance',
  'lr_issuance',
  'lr_subasset',
  'fairminter',
  'fairmint',
  'dividend',
  'broadcast',
  'attach',
  // A UTXO move is decoded, described and repack-proved, but was absent here — so every
  // legitimate move raised "Unknown Transaction Type", a spurious alarm on a supported
  // operation. Both spellings appear because the API and the local unpack agree on 'utxo' while
  // older records use 'utxo_move'.
  'utxo',
  'utxo_move',
  'mpma_send',
  'btcpay',
  'pooldeposit',
  'poolwithdraw',
]);

/**
 * Dust threshold in satoshis. Outputs at or below this are considered dust
 * and are normal for Counterparty transactions (e.g., multisig encoding,
 * dispenser triggers).
 */
const DUST_THRESHOLD = 546;

/**
 * Output script types that can carry a Counterparty payload. Reaching one of these without a
 * resolved message type means the payload was not read, which is not the same as its absence.
 * Covers both the PSBT decoder's vocabulary and the node's scriptPubKey types.
 */
const DATA_CARRYING_OUTPUT_TYPES = new Set([
  'op_return',   // present but did not decrypt to a Counterparty message
  'unknown',     // PSBT decoder: bare multisig lands here
  'multisig',    // node scriptPubKey type
  'nonstandard', // node scriptPubKey type
]);

/**
 * Analyze a decoded transaction for security risks.
 *
 * @param messageType - The Counterparty message type (e.g., "sweep", "enhanced_send")
 * @param outputs - Transaction outputs
 * @param signerAddress - The address that will sign this transaction
 * @returns Safety analysis with warnings
 */
export function analyzeTransactionSafety(
  messageType: string | undefined,
  outputs: AnalyzableOutput[],
  signerAddress: string | string[]
): SafetyAnalysis {
  const warnings: SecurityWarning[] = [];
  let blocked = false;

  // ── Check message type safety ──

  if (messageType) {
    if (BLOCKED_MESSAGE_TYPES.has(messageType)) {
      blocked = true;
      warnings.push({
        severity: 'block',
        title: 'Blocked: Sweep Transaction',
        message:
          'This transaction would send ALL of your Counterparty assets to another address. ' +
          'Sweep transactions cannot be signed through a website. Use the wallet directly if you need to sweep.',
      });
    } else if (DANGEROUS_MESSAGE_TYPES.has(messageType)) {
      warnings.push({
        severity: 'danger',
        title: 'Danger: Asset Destruction',
        message:
          'This transaction permanently destroys assets. This action is irreversible. ' +
          'Make sure you understand exactly what is being destroyed.',
      });
    } else if (MOVES_EVERYTHING_MESSAGE_TYPES.has(messageType)) {
      warnings.push({
        severity: 'warning',
        title: 'Moves Everything on the UTXO',
        message:
          'Detaching transfers every asset attached to this UTXO, not a stated amount. ' +
          'Check the destination in the transaction details before signing.',
      });
    } else if (!SAFE_MESSAGE_TYPES.has(messageType)) {
      warnings.push({
        severity: 'warning',
        title: 'Unknown Transaction Type',
        message: `Unrecognized message type "${messageType}". Review the transaction details carefully before signing.`,
      });
    }
  } else if (outputs.some((output) => DATA_CARRYING_OUTPUT_TYPES.has(output.type))) {
    // Every check above is keyed on the message type, so a payload that could not be read
    // reaches none of them. Say so rather than presenting it as an ordinary transfer.
    warnings.push({
      severity: 'warning',
      title: 'Unrecognized Transaction',
      message:
        'This transaction could not be identified as a known Counterparty action. It may carry ' +
        'protocol data in a form this screen cannot read. Review it carefully before signing.',
    });
  }

  // ── Check for suspicious outputs ──

  const normalizedSigners = new Set(
    (Array.isArray(signerAddress) ? signerAddress : [signerAddress])
      .map(normalizeAddressForComparison)
  );
  const suspiciousOutputs: Array<{ address: string; value: number }> = [];
  // The signers' own pubkeys, where this wallet holds them. A dApp transaction can name signer
  // addresses the wallet does not hold (other participants of a PSBT); those contribute nothing,
  // and with no keys known the recovery check below stays silent rather than guessing.
  const signerPubkeys = new Set(
    (Array.isArray(signerAddress) ? signerAddress : [signerAddress])
      .map((address) => getSourcePubkey(address)?.toLowerCase())
      .filter((pubkey): pubkey is string => !!pubkey)
  );
  let misdirectedRecoveryKeys = 0;
  /** Non-dust outputs whose script could not be resolved to any address. */
  const unattributableOutputs: Array<{ value: number }> = [];
  /** Recognized Counterparty multisig data outputs (payload, not payments). */
  const dataOutputs: Array<{ value: number }> = [];

  for (const output of outputs) {
    // Skip OP_RETURN — that's the Counterparty data, no BTC is sent
    if (output.type === 'op_return') continue;

    // Multisig data encoding: the payload itself, carried when it outgrows
    // OP_RETURN. Only trusted as such when the message actually decoded —
    // pattern alone must not silence the warning for an unread payload.
    if (!output.address && messageType && isCounterpartyDataScript(output.script)) {
      dataOutputs.push({ value: output.value });
      const recoveryKey = output.script ? bareMultisigRecoveryPubkey(output.script) : null;
      if (recoveryKey && signerPubkeys.size > 0 && !signerPubkeys.has(recoveryKey)) {
        misdirectedRecoveryKeys += 1;
      }
      continue;
    }

    // Skip outputs back to the signer (change)
    if (output.address && normalizedSigners.has(normalizeAddressForComparison(output.address))) continue;

    // Skip dust outputs — normal for Counterparty (multisig encoding, dispenser triggers)
    if (output.value <= DUST_THRESHOLD) continue;

    // This is a non-dust output to a different address — suspicious
    if (output.address) {
      suspiciousOutputs.push({ address: output.address, value: output.value });
    } else {
      // A script no decoder could attribute — bare multisig, P2WSH. Previously dropped here, so
      // such an output raised nothing and showed only as "Unknown address" in the movement list.
      unattributableOutputs.push({ value: output.value });
    }
  }

  if (misdirectedRecoveryKeys > 0) {
    // Each data output carries ~1,000 sats of dust, recoverable by whoever holds the embedded
    // key. Normally that is the signer; a composer that points it elsewhere is quietly donating
    // the signer's dust, forever. A warning rather than a block: the message itself may still be
    // exactly what the user asked for, and the dust is bounded — but nobody chooses this
    // knowingly, so it must not pass in silence.
    warnings.push({
      severity: 'warning',
      title: 'Data Outputs Not Recoverable By You',
      message:
        `${misdirectedRecoveryKeys} data output${misdirectedRecoveryKeys > 1 ? 's embed' : ' embeds'} ` +
        'a recovery key that is not yours, so their dust would be spendable by someone else.',
    });
  }

  if (suspiciousOutputs.length > 0) {
    const totalSats = suspiciousOutputs.reduce((sum, o) => sum + o.value, 0);
    const btcAmount = (totalSats / 100_000_000).toFixed(8);
    const addresses = suspiciousOutputs.map(o => o.address);
    const expected = messageType !== undefined && BTC_PAYING_MESSAGE_TYPES.has(messageType);

    warnings.push(
      expected
        ? {
            // The payment is the transaction, so this is information rather than a warning.
            // The address and amount still need checking, hence the wording.
            severity: 'info',
            title: 'BTC Payment',
            message:
              `This sends ${btcAmount} BTC to ${addresses.map(a => a.slice(0, 12) + '…').join(', ')}, ` +
              'which is how this type of transaction pays. Check the address is the one you mean.',
          }
        : {
            severity: 'danger',
            title: 'BTC Sent to External Address',
            message:
              `This transaction sends ${btcAmount} BTC to ${addresses.length === 1 ? 'an address' : `${addresses.length} addresses`} ` +
              `that ${addresses.length === 1 ? 'is' : 'are'} not yours: ${addresses.map(a => a.slice(0, 12) + '…').join(', ')}. ` +
              'Normal Counterparty transactions only send BTC back to your own address as change.',
          }
    );
  }

  if (dataOutputs.length > 0) {
    const totalSats = dataOutputs.reduce((sum, o) => sum + o.value, 0);
    warnings.push({
      severity: 'info',
      title: 'Counterparty Data Outputs',
      message:
        `${dataOutputs.length} output${dataOutputs.length === 1 ? '' : 's'} carry this transaction's ` +
        `Counterparty message as bare multisig (${totalSats.toLocaleString()} sats). Those sats are ` +
        'not payments to anyone — they are recoverable to your wallet later with the Recovery Tool.',
    });
  }

  if (unattributableOutputs.length > 0) {
    const totalSats = unattributableOutputs.reduce((sum, o) => sum + o.value, 0);
    const btcAmount = (totalSats / 100_000_000).toFixed(8);
    const count = unattributableOutputs.length;

    warnings.push({
      severity: 'danger',
      title: 'BTC Sent to an Unrecognized Script',
      message:
        `This transaction sends ${btcAmount} BTC to ${count === 1 ? 'an output' : `${count} outputs`} `
        + `whose destination could not be determined, so ${count === 1 ? 'it' : 'they'} cannot be `
        + 'shown as an address or confirmed to be yours. Do not sign unless you know what this '
        + 'script does.',
    });
  }

  // Sort warnings by severity: block > danger > warning > info
  const severityOrder: Record<WarningSeverity, number> = { block: 0, danger: 1, warning: 2, info: 3 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { blocked, warnings };
}
