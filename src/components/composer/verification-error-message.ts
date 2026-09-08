import type { ComposeVerificationDiagnostic } from '@/core/validation/compose-verification-error';
import { t } from '@/i18n';

/** Only explicit local codes are localized; callers keep the original reason for unknowns. */
export function verificationErrorMessage(diagnostic: ComposeVerificationDiagnostic | undefined): string | undefined {
  if (!diagnostic) return undefined;
  switch (diagnostic.code) {
    case 'fee_inputs_unavailable': return t('composer_verification_fee_inputs_unavailable');
    case 'fee_inputs_unreadable': return t('composer_verification_fee_inputs_unreadable');
    case 'fee_outputs_exceed_inputs': return t('composer_verification_fee_outputs_exceed_inputs');
    case 'fee_out_of_range': return t('composer_verification_fee_out_of_range');
    case 'fee_abnormally_high':
      return t('composer_verification_fee_abnormally_high', [String(diagnostic.data.feeSats), diagnostic.data.approximateRate]);
    case 'fee_exceeds_selected_rate':
      return t('composer_verification_fee_exceeds_selected_rate', [String(diagnostic.data.feeSats), String(diagnostic.data.selectedRate)]);
    case 'output_recovery_key_mismatch': return t('composer_verification_output_recovery_key_mismatch');
    case 'output_recipient_missing':
      return t('composer_verification_output_recipient_missing', [diagnostic.data.expected]);
    case 'output_recipient_position': {
      const outputs = diagnostic.data.preceding.map(({ address, value }) => t('composer_verification_output_payment', [
        String(value), address ?? t('composer_verification_output_unknown_script'),
      ])).join('; ');
      // Core's original diagnostic historically assumed multiple preceding outputs. The policy
      // also refuses a single wrong recipient; describe the actual evidence without changing it.
      return diagnostic.data.preceding.length === 1
        ? t('composer_verification_output_recipient_single', [outputs, diagnostic.data.expected])
        : t('composer_verification_output_recipient_multiple', [outputs, diagnostic.data.expected]);
    }
    case 'output_unexplained': {
      const outputs = diagnostic.data.outputs.map(({ address, value }) => t('composer_verification_output_payment', [
        String(value), address ?? t('composer_verification_output_unknown_address'),
      ])).join('; ');
      return diagnostic.data.outputs.length === 1
        ? t('composer_verification_output_unexplained_one', [outputs])
        : t('composer_verification_output_unexplained_many', [outputs]);
    }
  }
  return undefined;
}
