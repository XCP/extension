/**
 * Transaction Safety Analysis
 *
 * Analyzes decoded Counterparty transactions for security risks before signing.
 * Detects dangerous message types (sweep, destroy) and suspicious outputs
 * that could indicate a malicious site trying to drain the wallet.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { publicKeyPointId } from '@/core/bitcoin/publicKeyIdentity';
import { getSourcePubkey } from '@/core/counterparty/sourcePubkey';
import {
  bareMultisigRecoveryPubkey,
  isBareMultisigDataOutput,
} from '@/core/counterparty/unpack/multisig';
import { formatAmount } from '@/core/format';
import { t } from '@/i18n';

/** Severity of a security warning */
export type WarningSeverity = 'block' | 'danger' | 'warning' | 'info';

/** Existing fallback text plus facts the foreground can translate after background serialization. */
interface SecurityWarningText {
  severity: WarningSeverity;
  title: string;
  message: string;
}

export type SecurityWarning = SecurityWarningText & (
  | { code?: 'bitcoin_payment_gate' | 'counterparty_only_gate' | 'detach_all' | 'sweep' | 'destroy' | 'unrecognized_payload'; data?: never }
  | { code: 'unknown_message_type'; data: { messageType: string } }
  | { code: 'inscription_commit'; data: { totalSats: number; address: string } }
  | { code: 'misdirected_recovery_key'; data: { count: number } }
  | { code: 'expected_btc_payment'; data: { totalSats: number; addresses: string[]; plainBitcoinPayment: boolean } }
  | { code: 'external_btc_output'; data: { totalSats: number; addresses: string[] } }
  | { code: 'counterparty_data_outputs' | 'unattributable_outputs'; data: { totalSats: number; count: number } }
);

/** Stable identifiers for warnings that another presentation layer may describe more precisely. */
export type SecurityWarningCode = Exclude<SecurityWarning['code'], undefined>;

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
  return !!script && isBareMultisigDataOutput(script);
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
 * Compare SEC public keys by curve point, not by their serialized form.
 *
 * A legacy P2PKH key may be represented as either 33-byte compressed SEC or 65-byte
 * uncompressed SEC. Both encodings are spendable by the same private key. Falling back to the
 * lower-cased input preserves fail-closed behaviour for malformed keys used by callers/tests.
 */
function comparablePubkey(pubkey: string): string {
  return publicKeyPointId(pubkey) ?? pubkey.toLowerCase();
}

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
  signerAddress: string | string[],
  options: {
    /**
     * An inscription commit output the caller has already verified — address re-derived from the
     * declared envelope, keys proven to be the signer's (`providerInscriptions.ts`). Reported as
     * information rather than flagged: the coins stay under the signer's key, which is the fact
     * the external-address warning exists to check.
     */
    verifiedCommit?: { address: string; value: number };
    /** A separate provider capability identified this as an explicit Bitcoin payment request. */
    plainBitcoinPayment?: boolean;
  } = {}
): SafetyAnalysis {
  const warnings: SecurityWarning[] = [];
  let blocked = false;

  // ── Check message type safety ──

  if (messageType) {
    if (BLOCKED_MESSAGE_TYPES.has(messageType)) {
      blocked = true;
      warnings.push({
        code: 'sweep',
        severity: 'block',
        title: t('safety_blocked_sweep_transaction'),
        message: t('safety_this_would_send_all_counterparty'),
      });
    } else if (DANGEROUS_MESSAGE_TYPES.has(messageType)) {
      warnings.push({
        code: 'destroy',
        severity: 'danger',
        title: t('safety_danger_supply_destruction'),
        message: t('safety_this_transaction_permanently_destroys_supply'),
      });
    } else if (MOVES_EVERYTHING_MESSAGE_TYPES.has(messageType)) {
      warnings.push({
        code: 'detach_all',
        // Info, not warning: a detach doing exactly what a detach does is routine, and the
        // details list names each released balance. A detach whose assets leave the wallet
        // escalates through the attached-asset destination warning instead.
        severity: 'info',
        title: t('safety_moves_everything_on_the_utxo'),
        message: t('safety_detaching_transfers_every_asset_attached'),
      });
    } else if (!SAFE_MESSAGE_TYPES.has(messageType)) {
      warnings.push({
        code: 'unknown_message_type',
        data: { messageType },
        severity: 'warning',
        title: t('safety_unknown_transaction_type'),
        message: t('safety_unrecognized_message_type', messageType),
      });
    }
  } else if (outputs.some((output) => DATA_CARRYING_OUTPUT_TYPES.has(output.type))) {
    // Every check above is keyed on the message type, so a payload that could not be read
    // reaches none of them. Say so rather than presenting it as an ordinary transfer.
    warnings.push({
      code: 'unrecognized_payload',
      severity: 'warning',
      title: t('safety_unrecognized_transaction'),
      message: t('safety_this_transaction_could_not_be'),
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
      .map((address) => getSourcePubkey(address))
      .filter((pubkey): pubkey is string => !!pubkey)
      .map(comparablePubkey)
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
      if (recoveryKey && signerPubkeys.size > 0 && !signerPubkeys.has(comparablePubkey(recoveryKey))) {
        misdirectedRecoveryKeys += 1;
      }
      continue;
    }

    // Skip outputs back to the signer (change)
    if (output.address && normalizedSigners.has(normalizeAddressForComparison(output.address))) continue;

    // Skip the verified inscription commit — described by its own info entry below.
    if (options.verifiedCommit && output.address === options.verifiedCommit.address) continue;

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

  if (options.verifiedCommit) {
    const btcAmount = (options.verifiedCommit.value / 100_000_000).toFixed(8);
    warnings.push({
      code: 'inscription_commit',
      data: { totalSats: options.verifiedCommit.value, address: options.verifiedCommit.address },
      severity: 'info',
      title: t('safety_inscription_commit'),
      message: t('safety_this_funds_an_inscription', [
        btcAmount,
        `${options.verifiedCommit.address.slice(0, 12)}…`,
      ]),
    });
  }

  if (misdirectedRecoveryKeys > 0) {
    // Each data output carries ~1,000 sats of dust, recoverable by whoever holds the embedded
    // key. Normally that is the signer; a composer that points it elsewhere is quietly donating
    // the signer's dust, forever. A warning rather than a block: the message itself may still be
    // exactly what the user asked for, and the dust is bounded — but nobody chooses this
    // knowingly, so it must not pass in silence.
    warnings.push({
      code: 'misdirected_recovery_key',
      data: { count: misdirectedRecoveryKeys },
      severity: 'warning',
      title: t('safety_data_outputs_not_recoverable_by'),
      // One and several read differently in every language, so each sentence exists in both
      // forms rather than pluralising a suffix.
      message: misdirectedRecoveryKeys > 1
        ? t('safety_data_outputs_embed_a_recovery_key', String(misdirectedRecoveryKeys))
        : t('safety_data_output_embeds_a_recovery_key', String(misdirectedRecoveryKeys)),
    });
  }

  // A dispense's payment is already the screen's subject: the movement rows name the dispenser
  // address and the detail list says what comes back, so a note restating the payment is noise.
  if (suspiciousOutputs.length > 0 && messageType !== 'dispense') {
    const totalSats = suspiciousOutputs.reduce((sum, o) => sum + o.value, 0);
    const btcAmount = (totalSats / 100_000_000).toFixed(8);
    const addresses = suspiciousOutputs.map(o => o.address);
    const addressList = addresses.map(a => a.slice(0, 12) + '…').join(', ');
    const oneAddress = addresses.length === 1;
    const expected = options.plainBitcoinPayment
      || (messageType !== undefined && BTC_PAYING_MESSAGE_TYPES.has(messageType));

    warnings.push(
      expected
        ? {
            code: 'expected_btc_payment',
            data: { totalSats, addresses, plainBitcoinPayment: Boolean(options.plainBitcoinPayment) },
            // The payment is the transaction, so this is information rather than a warning.
            // The address and amount still need checking, hence the wording.
            severity: 'info',
            title: options.plainBitcoinPayment ? t('safety_bitcoin_payment') : t('safety_btc_payment'),
            message: options.plainBitcoinPayment
              ? t('safety_this_sends_btc_matching_the_declared', [btcAmount, addressList])
              : t('safety_this_sends_btc_which_is_how', [btcAmount, addressList]),
          }
        : {
            code: 'external_btc_output',
            data: { totalSats, addresses },
            severity: 'danger',
            title: t('safety_btc_sent_to_external_address'),
            // One address and several read differently in every language, so each sentence
            // exists in both forms rather than pluralising a suffix.
            message: oneAddress
              ? t('safety_this_transaction_sends_btc_to_an_address', [btcAmount, addressList])
              : t('safety_this_transaction_sends_btc_to_addresses', [
                  btcAmount,
                  String(addresses.length),
                  addressList,
                ]),
          }
    );
  }

  if (dataOutputs.length > 0) {
    const totalSats = dataOutputs.reduce((sum, o) => sum + o.value, 0);
    const subs = [
      String(dataOutputs.length),
      formatAmount({ value: totalSats, maximumFractionDigits: 0 }),
    ];
    warnings.push({
      code: 'counterparty_data_outputs',
      data: { totalSats, count: dataOutputs.length },
      severity: 'info',
      title: t('safety_counterparty_data_outputs'),
      // One output and several read differently in every language, so each sentence exists in
      // both forms rather than pluralising a suffix.
      message: dataOutputs.length === 1
        ? t('safety_output_carries_this_transactions_message', subs)
        : t('safety_outputs_carry_this_transactions_message', subs),
    });
  }

  if (unattributableOutputs.length > 0) {
    const totalSats = unattributableOutputs.reduce((sum, o) => sum + o.value, 0);
    const btcAmount = (totalSats / 100_000_000).toFixed(8);
    const count = unattributableOutputs.length;

    warnings.push({
      code: 'unattributable_outputs',
      data: { totalSats, count },
      severity: 'danger',
      title: t('safety_btc_sent_to_an_unrecognized_script'),
      message: count === 1
        ? t('safety_this_transaction_sends_btc_to_an_output', btcAmount)
        : t('safety_this_transaction_sends_btc_to_outputs', [btcAmount, String(count)]),
    });
  }

  // Sort warnings by severity: block > danger > warning > info
  const severityOrder: Record<WarningSeverity, number> = { block: 0, danger: 1, warning: 2, info: 3 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { blocked, warnings };
}
