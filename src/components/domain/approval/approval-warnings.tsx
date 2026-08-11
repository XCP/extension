/**
 * The warnings both approval screens raise about a transaction they are asked to sign.
 *
 * The PSBT screen and the raw-transaction screen answer the same questions about attached assets
 * and message structure, and they used to answer them in two identical copies of this code. That is
 * the wrong thing to duplicate: these strings are the whole of what the user is told before they
 * sign, so a fix applied to one copy and not the other means one route silently keeps warning
 * about the wrong thing.
 *
 * Warnings specific to one route stay on that route. The PSBT screen appends its own
 * ANYONECANPAY warning after calling this, because a raw transaction is signed SIGHASH_ALL
 * throughout and cannot be modified after signing.
 */

import type { WarningItem } from '@/components/ui/warning-stack';
import type { AttachedAssetDestination } from '@/core/counterparty/attachedAssetMovement';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { StructureFinding } from '@/core/counterparty/messageStructure';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';

export interface ApprovalWarningInput {
  /** Safety analysis warnings, already sorted by severity. */
  safetyWarnings: SecurityWarning[];
  /** Where assets attached to the signed inputs end up, when that could be resolved. */
  attachedAssetDestination: AttachedAssetDestination | null;
  /** Message fields that reference this transaction and do not resolve against it. */
  structureFindings: StructureFinding[];
  /** Signed inputs whose UTXOs carry assets — signing moves them. */
  signedInputsWithAssets: InputAttachedAssets[];
  /** Signed inputs whose asset lookup failed, so status is unknown rather than clean. */
  signedInputsUnknownStatus: InputAttachedAssets[];
}

export function buildApprovalWarnings({
  safetyWarnings,
  attachedAssetDestination,
  structureFindings,
  signedInputsWithAssets,
  signedInputsUnknownStatus,
}: ApprovalWarningInput): WarningItem[] {
  const warningItems: WarningItem[] = safetyWarnings.map((warning, idx) => ({
    key: `safety-${idx}`,
    severity: warning.severity === 'block' ? 'danger' : warning.severity,
    title: warning.title,
    description: warning.message,
  }));

  // Where the attached assets land. Spending an attached UTXO moves its balances with no
  // Counterparty message, so without this the screen can say only that assets move, never where —
  // and for an atomic swap that is the whole question.
  if (attachedAssetDestination) {
    const dest = attachedAssetDestination;
    warningItems.push({
      key: 'attached-destination',
      severity: dest.leavesWallet ? 'danger' : 'warning',
      title: dest.detaches
        ? 'Attached assets are detached to your address'
        : dest.leavesWallet
          ? 'Attached assets leave your wallet'
          : 'Attached assets move to your own output',
      description: dest.detaches
        ? 'This transaction has no ordinary output, so every asset attached to the inputs you are ' +
          'signing is credited back to your address.'
        : `Every asset attached to input${dest.sourceInputs.length === 1 ? '' : 's'} ` +
          `${dest.sourceInputs.map((i) => `#${i}`).join(', ')} is credited to output ` +
          `#${dest.destinationVout}${dest.destinationAddress ? ` (${dest.destinationAddress})` : ''}` +
          `${dest.leavesWallet ? ', which is not an address you control.' : '.'}`,
    });
  }

  // The message's own references to this transaction, where they do not resolve against it. A
  // warning rather than a block: core rejects such a transaction, so it is ineffective rather than
  // dangerous — but the screen cannot describe what it claims to do.
  for (const [idx, finding] of structureFindings.entries()) {
    warningItems.push({
      key: `structure-${idx}`,
      severity: 'warning',
      title: finding.title,
      description: finding.message,
    });
  }

  if (signedInputsWithAssets.length > 0) {
    warningItems.push({
      key: 'attached-assets',
      severity: 'warning',
      title: 'Spends UTXOs holding Counterparty assets',
      description: 'Inputs you are signing carry attached assets. Signing moves them, not just BTC.',
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {signedInputsWithAssets.flatMap(entry =>
            entry.assets.map(asset => (
              <li key={`${entry.inputIndex}-${asset.asset}`}>
                Input #{entry.inputIndex}: {asset.quantity_normalized} {asset.asset_longname ?? asset.asset}
              </li>
            ))
          )}
        </ul>
      ),
    });
  }

  if (signedInputsUnknownStatus.length > 0) {
    warningItems.push({
      key: 'unknown-status',
      severity: 'warning',
      title: "Couldn't verify asset status",
      // The inputs are listed below and the severity already carries the "be careful" — a closing
      // "proceed only if you trust this" sentence adds words the reader cannot act on.
      description: "The balance lookup failed, so attached assets can't be ruled out.",
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {signedInputsUnknownStatus.map(entry => (
            <li key={entry.inputIndex}>Input #{entry.inputIndex}: status unknown</li>
          ))}
        </ul>
      ),
    });
  }

  return warningItems;
}
