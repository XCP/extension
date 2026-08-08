/**
 * What the Counterparty message itself says, kept apart from the Bitcoin view around it.
 *
 * The headline is one line and loses most of it — a fairminter's headline is its asset name, while
 * the thing being agreed to is a set of caps, a price and a deadline. Both approval screens show
 * this, so it lives here rather than in two copies that can drift.
 */

import type { ProtocolField } from '@/core/counterparty/describe';

/**
 * Values longer than this get their own line instead of sharing a row with their label.
 * A hash or an outpoint right-aligned beside a label wrapped into three ragged lines that
 * nobody can read across.
 */
const OWN_LINE_LENGTH = 32;

export function CounterpartyDetailsCard({ fields }: { fields: ProtocolField[] }) {
  if (fields.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Counterparty Details</h3>
      <div className="space-y-1.5">
        {fields.map((field) =>
          field.value.length > OWN_LINE_LENGTH ? (
            // Monospace on its own line, where the digits line up and can be compared.
            <div key={field.label} className="text-sm">
              <div className="text-gray-500">{field.label}</div>
              <div className="text-gray-900 font-mono text-xs break-all mt-0.5">{field.value}</div>
            </div>
          ) : (
            <div key={field.label} className="flex justify-between gap-3 text-sm">
              <span className="text-gray-500 flex-shrink-0">{field.label}</span>
              <span className="text-gray-900 font-medium text-right break-all">{field.value}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
