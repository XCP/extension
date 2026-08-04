/**
 * Transaction Safety Analysis
 *
 * Analyzes decoded Counterparty transactions for security risks before signing.
 * Detects dangerous message types (sweep, destroy) and suspicious outputs
 * that could indicate a malicious site trying to drain the wallet.
 */

import { normalizeAddressForComparison } from '@/utils/blockchain/bitcoin/address';

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
}

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
  'bet',
  'attach',
  'detach',
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
  /** Non-dust outputs whose script could not be resolved to any address. */
  const unattributableOutputs: Array<{ value: number }> = [];

  for (const output of outputs) {
    // Skip OP_RETURN — that's the Counterparty data, no BTC is sent
    if (output.type === 'op_return') continue;

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

  if (suspiciousOutputs.length > 0) {
    const totalSats = suspiciousOutputs.reduce((sum, o) => sum + o.value, 0);
    const btcAmount = (totalSats / 100_000_000).toFixed(8);
    const addresses = suspiciousOutputs.map(o => o.address);

    warnings.push({
      severity: 'danger',
      title: 'BTC Sent to External Address',
      message:
        `This transaction sends ${btcAmount} BTC to ${addresses.length === 1 ? 'an address' : `${addresses.length} addresses`} ` +
        `that ${addresses.length === 1 ? 'is' : 'are'} not yours: ${addresses.map(a => a.slice(0, 12) + '…').join(', ')}. ` +
        'Normal Counterparty transactions only send BTC back to your own address as change.',
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
