import type { ReactNode } from 'react';
import { FiAlertTriangle, FiInfo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Collapsible } from '@/components/ui/collapsible';
import type { WarningItem } from '@/components/ui/warning-stack';
import { divide, roundUp } from '@/core/numeric';

interface ApprovalAttentionScreenProps {
  title: string;
  description: string;
  items: WarningItem[];
  confirmLabel: string;
  busy: boolean;
  isHardware: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

/**
 * A deliberate second step for an exceptional, but knowingly signable, authorization.
 *
 * The ordinary review page stays visually quiet. Only after the user chooses Review does this
 * screen interrupt the flow and name the consequences that need a second decision. The cards are
 * deliberately neutral: one danger icon and an action-specific confirmation carry the hierarchy,
 * instead of painting every independently detected fact red or amber.
 */
export function ApprovalAttentionScreen({
  title,
  description,
  items,
  confirmLabel,
  busy,
  isHardware,
  onBack,
  onConfirm,
}: ApprovalAttentionScreenProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex h-dvh flex-col bg-gray-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-attention-title"
    >
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-md space-y-4">
          <div className="py-3 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-warning-100">
              <FiAlertTriangle className="size-5 text-warning-700" aria-hidden="true" />
            </div>
            <h1 id="approval-attention-title" className="text-lg font-semibold text-gray-900">
              {title}
            </h1>
            <p className="mx-auto mt-1 max-w-[300px] text-sm text-gray-600">{description}</p>
          </div>

          <div className="space-y-3">
            {items.map(item => (
              <section key={item.key} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">{item.title}</h2>
                {item.description && (
                  <p className="mt-1 text-sm leading-5 text-gray-600">{item.description}</p>
                )}
                {item.children && <div className="mt-2 text-gray-700">{item.children}</div>}
              </section>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <Button color="gray" onClick={onBack} disabled={busy} fullWidth>
            Back
          </Button>
          <Button color="blue" onClick={onConfirm} disabled={busy} fullWidth>
            {busy ? (isHardware ? 'Confirm on device…' : 'Signing…') : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Routine mechanics stay available without competing visually with real warnings.
 */
export function ApprovalNotes({ items }: { items: WarningItem[] }) {
  if (items.length === 0) return null;
  return (
    <Collapsible variant="card" title="How this transaction works">
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.key} className="flex items-start gap-2 text-xs text-gray-600">
            <FiInfo className="mt-0.5 size-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
            <div>
              <p className="font-medium text-gray-700">{item.title}</p>
              {item.description && <p className="mt-0.5 leading-5">{item.description}</p>}
              {item.children as ReactNode}
            </div>
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

/** Preserve the analyzer's fixed ordering while separating routine notes from decision friction. */
export function partitionApprovalItems(items: WarningItem[]) {
  return {
    informational: items.filter(item => item.severity === 'info' || item.severity === 'success'),
    attention: items.filter(item => item.severity === 'warning' || item.severity === 'danger'),
  };
}

/** Keep the fee consequence and its wording identical on raw-transaction and PSBT approvals. */
export function highFeeAttentionItem(feeSats: number, vsize?: number): WarningItem {
  const feeRate = vsize && vsize > 0 ? roundUp(divide(feeSats, vsize)).toFixed(0) : null;
  return {
    key: 'high-fee',
    severity: 'warning',
    title: 'Unusually high network fee',
    description:
      `This transaction pays ${feeSats.toLocaleString()} sats` +
      `${feeRate === null ? '' : ` (about ${feeRate} sat/vB)`}. ` +
      'Confirm that this fee is intentional.',
  };
}

/** A user-disabled decoder check becomes deliberate friction, never a silent fast path. */
export function verificationAttentionItem(message?: string): WarningItem {
  return {
    key: 'verification-warning',
    severity: 'warning',
    title: 'The wallet could not reproduce every transaction field',
    description: message
      ? `${message} Review this exception before signing.`
      : 'Strict verification is disabled. Review this exception before signing.',
  };
}
