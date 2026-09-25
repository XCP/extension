/**
 * What the Counterparty message itself says, kept apart from the Bitcoin view around it.
 *
 * The headline is one line and loses most of it — a fairminter's headline is its asset name, while
 * the thing being agreed to is a set of caps, a price and a deadline. Both approval screens show
 * this, so it lives here rather than in two copies that can drift.
 */

import type { ProtocolField } from '@/core/counterparty/describe';
import { t } from '@/i18n';
import { ApprovalFacts } from './approval-facts';
import { ApprovalIdentifier } from './approval-identifier';
import { ApprovalList } from './approval-list';
/** An mpma_send recipient: destinations travel in the payload, so this list is the only account of who is paid. */
export interface CounterpartyDetailRecipient {
  asset: string;
  quantity: string;
  address: string;
}

export function CounterpartyDetailsCard({
  fields,
  recipients = [],
  title,
  notes = [],
}: {
  fields: ProtocolField[];
  recipients?: CounterpartyDetailRecipient[];
  /** Section heading when the transaction carries no Counterparty message to name it after. */
  title?: string;
  /** Plain-language outcome statements shown under the facts. */
  notes?: string[];
}) {
  if (fields.length === 0 && recipients.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">{title ?? t('approval_counterparty_details_card_counterparty')}</h3>
      <ApprovalFacts fields={fields} />
      {notes.map((note, index) => (
        <p key={`note-${index}`} className="mt-3 border-t border-gray-100 pt-3 text-sm leading-5 text-gray-600">{note}</p>
      ))}
      {recipients.length > 0 && (
        <div className={fields.length > 0 ? 'mt-3' : ''}>
          <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
            {t('approval_counterparty_details_card_recipients', [String(recipients.length)])}
          </h4>
          <ApprovalList
            items={recipients}
            render={(recipient, index) => (
              <div key={`${recipient.address}-${index}`} className="rounded bg-gray-50 px-2 py-1.5">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 text-gray-600 [overflow-wrap:anywhere]">{recipient.asset}</span>
                  <span className="ml-auto font-medium tabular-nums text-gray-900">{recipient.quantity}</span>
                </div>
                {/* Shown in full: short address fragments are grindable for lookalikes. */}
                <div className="mt-0.5 text-gray-700" title={recipient.address}>
                  <ApprovalIdentifier value={recipient.address} copyLabel={recipient.asset} />
                </div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
