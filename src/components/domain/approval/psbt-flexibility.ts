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
      title: 'Some of your funds can be redirected',
      description:
        'Part of the amount shown returning to your wallet can be sent somewhere else after you sign.',
    };
  }

  if (hasOutputFlexibleSignature) {
    return {
      kind: 'outputs-flexible',
      severity: 'warning',
      title: 'Only paired outputs are fixed',
      description:
        'Each SINGLE|ANYONECANPAY signature fixes only the output with the same index. Other inputs ' +
        'or outputs may be added or changed after you sign.',
    };
  }

  return {
    kind: 'inputs-only',
    severity: 'info',
    title: 'Other funding inputs may be added',
    description:
      'Your ALL|ANYONECANPAY signature fixes every current output. It allows other funding inputs ' +
      'to be added without changing those payments.',
  };
}
