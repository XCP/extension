/**
 * Transaction Safety Analysis
 *
 * Analyzes decoded Counterparty transactions for security risks before signing.
 * Detects dangerous message types (sweep, destroy) and suspicious outputs
 * that could indicate a malicious site trying to drain the wallet.
 */

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
  'attach',
  'detach',
  'mpma_send',
  'btcpay',
]);

/**
 * Dust threshold in satoshis. Outputs at or below this are considered dust
 * and are normal for Counterparty transactions (e.g., multisig encoding,
 * dispenser triggers).
 */
const DUST_THRESHOLD = 546;

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
  signerAddress: string
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
  }

  // ── Check for suspicious outputs ──

  const normalizedSigner = signerAddress.toLowerCase();
  const suspiciousOutputs: Array<{ address: string; value: number }> = [];

  for (const output of outputs) {
    // Skip OP_RETURN — that's the Counterparty data, no BTC is sent
    if (output.type === 'op_return') continue;

    // Skip outputs back to the signer (change)
    if (output.address && output.address.toLowerCase() === normalizedSigner) continue;

    // Skip dust outputs — normal for Counterparty (multisig encoding, dispenser triggers)
    if (output.value <= DUST_THRESHOLD) continue;

    // This is a non-dust output to a different address — suspicious
    if (output.address) {
      suspiciousOutputs.push({ address: output.address, value: output.value });
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

  // Sort warnings by severity: block > danger > warning > info
  const severityOrder: Record<WarningSeverity, number> = { block: 0, danger: 1, warning: 2, info: 3 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { blocked, warnings };
}
