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
import { formatAmount } from '@/core/format';

import { t } from '@/i18n';

/** Known local findings are translated here, after crossing the background/UI language boundary. */
function safetyWarningText(warning: SecurityWarning): { title: string; description: string } {
  switch (warning.code) {
    case 'sweep':
      return { title: t('safety_blocked_sweep_transaction'), description: t('safety_this_would_send_all_counterparty') };
    case 'destroy':
      return { title: t('safety_danger_supply_destruction'), description: t('safety_this_transaction_permanently_destroys_supply') };
    case 'detach_all':
      return { title: t('safety_moves_everything_on_the_utxo'), description: t('safety_detaching_transfers_every_asset_attached') };
    case 'unknown_message_type':
      return { title: t('safety_unknown_transaction_type'), description: t('safety_unrecognized_message_type', warning.data.messageType) };
    case 'unrecognized_payload':
      return { title: t('safety_unrecognized_transaction'), description: t('safety_this_transaction_could_not_be') };
    case 'inscription_commit':
      return {
        title: t('safety_inscription_commit'),
        description: t('safety_this_funds_an_inscription', [
          (warning.data.totalSats / 100_000_000).toFixed(8), `${warning.data.address.slice(0, 12)}…`,
        ]),
      };
    case 'misdirected_recovery_key':
      return {
        title: t('safety_data_outputs_not_recoverable_by'),
        description: warning.data.count > 1
          ? t('safety_data_outputs_embed_a_recovery_key', String(warning.data.count))
          : t('safety_data_output_embeds_a_recovery_key', String(warning.data.count)),
      };
    case 'expected_btc_payment':
    case 'external_btc_output': {
      const btcAmount = (warning.data.totalSats / 100_000_000).toFixed(8);
      const addressList = warning.data.addresses.map(address => `${address.slice(0, 12)}…`).join(', ');
      if (warning.code === 'expected_btc_payment') {
        return {
          title: warning.data.plainBitcoinPayment ? t('safety_bitcoin_payment') : t('safety_btc_payment'),
          description: warning.data.plainBitcoinPayment
            ? t('safety_this_sends_btc_matching_the_declared', [btcAmount, addressList])
            : t('safety_this_sends_btc_which_is_how', [btcAmount, addressList]),
        };
      }
      return {
        title: t('safety_btc_sent_to_external_address'),
        description: warning.data.addresses.length === 1
          ? t('safety_this_transaction_sends_btc_to_an_address', [btcAmount, addressList])
          : t('safety_this_transaction_sends_btc_to_addresses', [btcAmount, String(warning.data.addresses.length), addressList]),
      };
    }
    case 'counterparty_data_outputs': {
      const subs = [String(warning.data.count), formatAmount({ value: warning.data.totalSats, maximumFractionDigits: 0 })];
      return {
        title: t('safety_counterparty_data_outputs'),
        description: warning.data.count === 1
          ? t('safety_output_carries_this_transactions_message', subs)
          : t('safety_outputs_carry_this_transactions_message', subs),
      };
    }
    case 'unattributable_outputs': {
      const btcAmount = (warning.data.totalSats / 100_000_000).toFixed(8);
      return {
        title: t('safety_btc_sent_to_an_unrecognized_script'),
        description: warning.data.count === 1
          ? t('safety_this_transaction_sends_btc_to_an_output', btcAmount)
          : t('safety_this_transaction_sends_btc_to_outputs', [btcAmount, String(warning.data.count)]),
      };
    }
    default:
      // Other analyzers and unstructured/API diagnostics keep their original evidence verbatim.
      return { title: warning.title, description: warning.message };
  }
}

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
    ...safetyWarningText(warning),
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

  // These local mismatches keep the existing wallet block. Missing attach outputs are invalid in
  // Core; the legacy UTXO source check is stricter wallet policy, not a Core-invalidity claim.
  for (const [idx, finding] of structureFindings.entries()) {
    const text = finding.code === 'attach_missing_output'
      ? {
          title: t('approval_structure_attach_missing_output_title'),
          description: finding.data.outputCount === 1
            ? t('approval_structure_attach_missing_output_one', [String(finding.data.destinationVout), String(finding.data.outputCount)])
            : t('approval_structure_attach_missing_output_many', [String(finding.data.destinationVout), String(finding.data.outputCount)]),
        }
      : {
          title: t('approval_structure_utxo_source_not_spent_title'),
          description: t('approval_structure_utxo_source_not_spent_description', [finding.data.source]),
        };
    warningItems.push({
      key: `structure-${idx}`,
      severity: 'warning',
      blocking: true,
      ...text,
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
