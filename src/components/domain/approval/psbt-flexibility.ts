import { t } from '@/i18n';

export type PsbtFlexibilityKind = 'inputs-only' | 'outputs-flexible';

export interface PsbtFlexibilityReview {
  kind: PsbtFlexibilityKind;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
}

/**
 * Describe what the signatures requested from this wallet can still authorize after signing.
 *
 * ALL|ANYONECANPAY fixes every current output and only permits other inputs to be added.
 * SINGLE|ANYONECANPAY fixes its same-index output; because an individual ACP input and signature
 * can survive after the rest are dropped, the weaker detachable signature determines the warning.
 */
export function describePsbtFlexibility(
  signedInputs: Array<{ index: number; sighashType: number }>,
  atRiskSats: number
): PsbtFlexibilityReview | null {
  const anyoneCanPay = signedInputs.filter(({ sighashType }) => (sighashType & 0x80) !== 0);
  if (anyoneCanPay.length === 0) return null;

  const hasOutputFlexibleSignature = anyoneCanPay.some(
    ({ sighashType }) => (sighashType & 0x1f) !== 0x01
  );

  if (atRiskSats > 0) {
    return {
      kind: 'outputs-flexible',
      severity: 'danger',
      title: t('approval_psbt_some_of_your_funds_can'),
      description: t('approval_psbt_part_of_the_amount_shown'),
    };
  }

  if (hasOutputFlexibleSignature) {
    return {
      kind: 'outputs-flexible',
      severity: 'warning',
      title: t('approval_psbt_only_paired_outputs_are_fixed'),
      description: t('approval_psbt_each_single_anyonecanpay_signature_fixes'),
    };
  }

  return {
    kind: 'inputs-only',
    severity: 'info',
    title: t('approval_psbt_other_funding_inputs_may_be'),
    description: t('approval_psbt_your_all_anyonecanpay_signature_fixes'),
  };
}
