/**
 * What the Counterparty message itself says, kept apart from the Bitcoin view around it.
 *
 * The headline is one line and loses most of it — a fairminter's headline is its asset name, while
 * the thing being agreed to is a set of caps, a price and a deadline. Both approval screens show
 * this, so it lives here rather than in two copies that can drift.
 */

import type { ProtocolField } from '@/core/counterparty/describe';
import { ApprovalFacts } from './approval-facts';
import { ApprovalIdentifier } from './approval-identifier';

/** An mpma_send recipient: destinations travel in the payload, so this list is the only account of who is paid. */
export interface CounterpartyDetailRecipient {
  asset: string;
  quantity: string;
  address: string;
}

export function CounterpartyDetailsCard({
  fields,
  recipients = [],
}: {
  fields: ProtocolField[];
  recipients?: CounterpartyDetailRecipient[];
}) {
  if (fields.length === 0 && recipients.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Counterparty Details</h3>
      <ApprovalFacts fields={fields} />
      {recipients.length > 0 && (
        <div className={fields.length > 0 ? 'mt-3' : ''}>
          <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
            Recipients ({recipients.length})
          </h4>
          <div className="space-y-2">
            {recipients.map((recipient, index) => (
              <div key={`${recipient.address}-${index}`} className="rounded bg-gray-50 p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 text-gray-600 [overflow-wrap:anywhere]">{recipient.asset}</span>
                  <span className="flex-shrink-0 font-medium text-gray-900">
                    {recipient.quantity}
                  </span>
                </div>
                {/* Shown in full: short address fragments are grindable for lookalikes. */}
                <div className="select-all font-mono leading-normal text-gray-600 [overflow-wrap:anywhere]" title={recipient.address}>
                  <ApprovalIdentifier value={recipient.address} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
