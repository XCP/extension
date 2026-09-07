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
import { getMessageSigningRisks } from '@/core/bitcoin/messageRisk';
import type { AttachedAssetDestination } from '@/core/counterparty/attachedAssetMovement';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { StructureFinding } from '@/core/counterparty/messageStructure';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';

import { t } from '@/i18n';
export interface ApprovalWarningInput {
  /** Free text actually rendered in the action summary or protocol details. */
  displayedText?: string[];
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
  displayedText = [],
  safetyWarnings,
  attachedAssetDestination,
  structureFindings,
  signedInputsWithAssets,
  signedInputsUnknownStatus,
}: ApprovalWarningInput): WarningItem[] {
  // A resolved attached destination below says where every attached balance goes. The generic
  // detach warning says only that every balance moves, so showing both turns one fact into two
  // alarms and makes a routine detach look more suspicious than it is.
  const presentedSafetyWarnings = attachedAssetDestination
    ? safetyWarnings.filter((warning) => warning.code !== 'detach_all')
    : safetyWarnings;
  const warningItems: WarningItem[] = presentedSafetyWarnings.map((warning, idx) => ({
    key: `safety-${idx}`,
    severity: warning.severity === 'block' ? 'danger' : warning.severity,
    blocking: warning.severity === 'block',
    title: warning.title,
    description: warning.message,
  }));

  const renderedText = displayedText.filter((value) => value.length > 0).join('\n');
  if (renderedText) {
    for (const risk of getMessageSigningRisks(renderedText)) {
      if (risk.key === 'empty-message') continue;
      warningItems.push({
        key: `display-${risk.key}`,
        severity: 'warning',
        title: risk.key === 'deceptive-characters'
          ? t('approval_approval_warnings_transaction_details_contain_hidden_characters')
          : t('approval_approval_warnings_transaction_details_contain_control_characters'),
        description: risk.key === 'deceptive-characters'
          ? t('approval_approval_warnings_a_memo_description_or_asset')
            + t('approval_approval_warnings_check_the_decoded_amounts_and')
          : t('approval_approval_warnings_a_memo_description_or_asset_2'),
      });
    }
  }

  // Where the attached assets land. Spending an attached UTXO moves its balances with no
  // Counterparty message, so without this the screen can say only that assets move, never where —
  // and for an atomic swap that is the whole question.
  const attachedAssetList = signedInputsWithAssets.length > 0 ? (
    <ul className="mt-2 space-y-1 text-xs font-medium">
      {signedInputsWithAssets.flatMap(entry =>
        entry.assets.map(asset => (
          <li key={`${entry.inputIndex}-${asset.asset}`}>
            {t('approval_approval_warnings_input', [String(entry.inputIndex), String(asset.quantity_normalized), String(asset.asset_longname ?? asset.asset)])}
          </li>
        ))
      )}
    </ul>
  ) : undefined;

  if (attachedAssetDestination) {
    const dest = attachedAssetDestination;
    // "#0, #2": the inputs carrying assets. One input and several read differently in every
    // language, so each sentence exists in both forms rather than pluralising a suffix.
    const inputList = dest.sourceInputs.map((i) => `#${i}`).join(', ');
    const oneInput = dest.sourceInputs.length === 1;
    if (!dest.destinationCommitted) {
      warningItems.push({
        key: 'attached-destination',
        severity: 'danger',
        title: t('approval_approval_warnings_asset_delivery_is_flexible'),
        description: oneInput
          ? t('approval_approval_warnings_the_signature_for_attached_input', [String(inputList)])
          : t('approval_approval_warnings_the_signature_for_attached_inputs', [String(inputList)]),
        children: attachedAssetList,
      });
    } else {
    const outputRef = `#${dest.destinationVout}${dest.destinationAddress ? ` (${dest.destinationAddress})` : ''}`;
    warningItems.push({
      key: 'attached-destination',
      severity: dest.leavesWallet ? 'danger' : 'info',
      title: dest.detaches
        ? dest.leavesWallet
          ? t('approval_approval_warnings_assets_are_detached_to_another')
          : t('approval_approval_warnings_attached_assets_are_detached_to')
        : dest.leavesWallet
          ? t('approval_approval_warnings_attached_assets_leave_your_wallet')
          : t('approval_approval_warnings_attached_assets_move_to_your'),
      description: dest.detaches
        ? dest.mode === 'explicit-detach'
          ? dest.destinationAddress
            ? oneInput
              ? t('approval_approval_warnings_every_asset_attached_to_input', [String(inputList), String(dest.destinationAddress)])
              : t('approval_approval_warnings_every_asset_attached_to_inputs', [String(inputList), String(dest.destinationAddress)])
            : oneInput
              ? t('approval_approval_warnings_every_asset_attached_to_input_2', [String(inputList)])
              : t('approval_approval_warnings_every_asset_attached_to_inputs_2', [String(inputList)])
          : t('approval_approval_warnings_this_transaction_has_no_ordinary')
        : dest.leavesWallet
          ? oneInput
            ? t('approval_approval_warnings_every_asset_attached_to_input_3', [String(inputList), String(outputRef)])
            : t('approval_approval_warnings_every_asset_attached_to_inputs_3', [String(inputList), String(outputRef)])
          : oneInput
            ? t('approval_approval_warnings_every_asset_attached_to_input_4', [String(inputList), String(outputRef)])
            : t('approval_approval_warnings_every_asset_attached_to_inputs_4', [String(inputList), String(outputRef)]),
      children: attachedAssetList,
    });
    }
  }

  // The message's own references to this transaction, where they do not resolve against it. A
  // Core rejects such a transaction. Signing is blocked because the screen cannot describe what
  // it claims to do; the finding must lead ahead of unrelated signable cautions.
  for (const [idx, finding] of structureFindings.entries()) {
    warningItems.push({
      key: `structure-${idx}`,
      severity: 'warning',
      blocking: true,
      title: finding.title,
      description: finding.message,
    });
  }

  if (!attachedAssetDestination && signedInputsWithAssets.length > 0) {
    warningItems.push({
      key: 'attached-assets',
      severity: 'warning',
      title: t('approval_approval_warnings_spends_utxos_holding_counterparty_assets'),
      description: t('approval_approval_warnings_inputs_you_are_signing_carry'),
      children: attachedAssetList,
    });
  }

  if (signedInputsUnknownStatus.length > 0) {
    warningItems.push({
      key: 'unknown-status',
      severity: 'warning',
      blocking: true,
      title: t('approval_approval_warnings_couldn_t_verify_asset_status'),
      // The inputs are listed below and the severity already carries the "be careful" — a closing
      // "proceed only if you trust this" sentence adds words the reader cannot act on.
      description: t('approval_approval_warnings_the_balance_lookup_failed_so'),
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {signedInputsUnknownStatus.map(entry => (
            <li key={entry.inputIndex}>{t('approval_approval_warnings_input_status_unknown', [String(entry.inputIndex)])}</li>
          ))}
        </ul>
      ),
    });
  }

  return warningItems;
}
