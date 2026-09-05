import type { ProtocolField } from '@/core/counterparty/describe';
import { ApprovalIdentifier } from './approval-identifier';

/** The same field grammar for protocol details and marketplace bundles. */
export function ApprovalFacts({ fields }: { fields: ProtocolField[] }) {
  return (
    <dl className="space-y-2 text-sm leading-5">
      {fields.map((field, index) => {
        const identifier = field.kind === 'address' || field.kind === 'outpoint' || field.kind === 'identifier';
        const primary = field.emphasis === 'primary';
        const stacked = identifier || primary || field.kind === 'paragraph' || field.layout === 'stacked';
        return (
          <div key={`${field.label}-${index}`} className={stacked ? 'min-w-0' : 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-3'}>
            <dt className="text-gray-600 [overflow-wrap:anywhere]">{field.label}</dt>
            <dd className={[
              'min-w-0 text-gray-900 [overflow-wrap:anywhere]',
              identifier ? 'mt-0.5 select-all font-mono text-xs leading-normal' : '',
              primary ? 'mt-0.5 text-2xl font-semibold leading-tight tabular-nums' : '',
              field.kind === 'paragraph' ? 'mt-0.5 whitespace-pre-wrap' : '',
              !stacked ? 'text-right font-medium' : '',
              field.kind === 'amount' ? 'tabular-nums' : '',
            ].filter(Boolean).join(' ')}>
              {identifier ? <ApprovalIdentifier value={field.value} /> : field.value}
            </dd>
            {field.description && (
              <dd className="col-span-2 mt-1 text-xs leading-normal text-gray-600 [overflow-wrap:anywhere]">
                {field.description}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
