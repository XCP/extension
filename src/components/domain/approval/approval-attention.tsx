import { Description, Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { FiAlertTriangle } from '@/components/icons';
import { Button } from '@/components/ui/button';
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  // Headless UI must discover the owning app tree before enabling its inert effect. Opening on
  // the first commit of a subsequent mount otherwise leaves background controls operable.
  // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the dialog with Headless UI's mounted app-tree discovery.
  useLayoutEffect(() => setOpen(true), []);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) titleRef.current?.focus({ preventScroll: true });
        else onBack();
      }}
      initialFocus={titleRef}
      className="relative z-50"
    >
      <DialogPanel className="fixed inset-0 flex h-dvh flex-col bg-gray-50">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-md space-y-3">
            <div className="py-3 text-center">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-warning-100">
                <FiAlertTriangle className="size-5 text-warning-700" aria-hidden="true" />
              </div>
              <DialogTitle as="h1" ref={titleRef} tabIndex={-1} className="text-lg leading-6 font-semibold text-gray-900 outline-none">
                {title}
              </DialogTitle>
              <Description className="mx-auto mt-1 max-w-[300px] text-sm leading-5 text-gray-600">{description}</Description>
            </div>

            <div className="space-y-3">
              {items.map(item => (
                <section key={item.key} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm leading-5 font-semibold text-gray-900">{item.title}</h2>
                  {item.description && (
                    <p className="mt-1 text-sm leading-5 text-gray-600">{item.description}</p>
                  )}
                  {item.children && <div className="mt-2 text-sm leading-5 text-gray-700">{item.children}</div>}
                </section>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white p-4 text-sm leading-5">
          <div className="mx-auto flex max-w-md flex-wrap gap-3">
            <Button color="gray" onClick={onBack} disabled={busy} fullWidth className="min-h-11 flex-[1_1_5rem]">
              Back
            </Button>
            <Button color="blue" onClick={onConfirm} disabled={busy} fullWidth className="min-h-11 flex-[2_1_10rem] bg-blue-600 hover:bg-blue-700">
              {busy ? (isHardware ? 'Confirm on device…' : 'Signing…') : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  );
}

/**
 * The items that earn decision friction. Info- and success-severity statements are dropped from
 * the approval screens entirely — a routine mechanical note next to a signature request reads as
 * a warning whether or not it is one.
 */
export function partitionApprovalItems(items: WarningItem[]) {
  return {
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
