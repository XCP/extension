import type { ProtocolField } from '@/core/counterparty/describe';
import { ApprovalCopyButton, ApprovalIdentifier } from './approval-identifier';
import { ApprovalList } from './approval-list';
import { isShortText } from './fact-layout';

type Layout = 'primary' | 'row' | 'identifier' | 'stacked' | 'list';

/**
 * The field's kind decides its layout; producers say what a value is, never how it looks.
 *
 * - An amount, number or date is one row: label left, value right in tabular figures. When
 *   both do not fit, the value drops to the next line whole rather than splitting.
 * - An address, outpoint or txid is stacked: label and copy button on one line, the full value in
 *   monospace below it, never truncated.
 * - Text sits on the value side only when it is short (three words, 16 half-width units, no full
 *   stop); a sentence goes under its label.
 * - A list shows its first three entries, then "Show all N".
 */
function layoutOf(field: ProtocolField): Layout {
  if (field.emphasis === 'primary') return 'primary';
  switch (field.kind) {
    case 'address':
    case 'outpoint':
    case 'identifier':
      return 'identifier';
    case 'list':
      return field.items && field.items.length > 0 ? 'list' : 'stacked';
    case 'paragraph':
      return 'stacked';
    case 'amount':
    case 'date':
      return field.layout === 'stacked' ? 'stacked' : 'row';
    default:
      return field.layout !== 'stacked' && isShortText(field.value) ? 'row' : 'stacked';
  }
}

function Description({ text }: { text?: string }) {
  if (!text) return null;
  return <dd className="w-full text-xs leading-normal text-gray-600 [overflow-wrap:anywhere]">{text}</dd>;
}

/** One fact component for protocol details, marketplace reviews and bundle summaries. */
export function ApprovalFacts({ fields }: { fields: ProtocolField[] }) {
  return (
    <dl className="space-y-2 text-sm leading-5">
      {fields.map((field, index) => {
        const key = `${field.label}-${index}`;
        const layout = layoutOf(field);
        const label = <dt data-fact-label="" className="min-w-0 text-gray-600">{field.label}</dt>;
        switch (layout) {
          case 'row':
            return (
              <div key={key} data-fact-layout="row" className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                {label}
                <dd className={`ml-auto min-w-0 text-right font-medium text-gray-900 [overflow-wrap:anywhere] ${field.kind === 'amount' || field.kind === 'date' ? 'tabular-nums' : ''}`}>
                  {field.value}
                </dd>
                <Description text={field.description} />
              </div>
            );
          case 'primary':
            return (
              <div key={key} data-fact-layout="primary" className="min-w-0">
                {label}
                <dd className="mt-0.5 text-2xl font-semibold leading-tight tabular-nums text-gray-900 [overflow-wrap:anywhere]">{field.value}</dd>
                <Description text={field.description} />
              </div>
            );
          case 'identifier':
            return (
              <div key={key} data-fact-layout="identifier" className="min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  {label}
                  <span className="-my-1"><ApprovalCopyButton value={field.value} label={field.label} /></span>
                </div>
                <dd className="mt-0.5 min-w-0 text-gray-900"><ApprovalIdentifier value={field.value} copy={false} /></dd>
                <Description text={field.description} />
              </div>
            );
          case 'list':
            return (
              <div key={key} data-fact-layout="list" className="min-w-0">
                <dt data-fact-label="" className="text-gray-600">
                  {field.label}<span className="text-gray-400"> · </span><span className="tabular-nums">{field.items!.length}</span>
                </dt>
                <dd className="mt-0.5 min-w-0">
                  <ApprovalList
                    as="ul"
                    className="space-y-0.5"
                    items={field.items!}
                    render={(item, itemIndex) => (
                      <li key={`${item}-${itemIndex}`} className="font-medium tabular-nums text-gray-900 [overflow-wrap:anywhere]">{item}</li>
                    )}
                  />
                </dd>
                <Description text={field.description} />
              </div>
            );
          default:
            return (
              <div key={key} data-fact-layout="stacked" className="min-w-0">
                {label}
                <dd className={`mt-0.5 min-w-0 text-gray-900 [overflow-wrap:anywhere] ${field.kind === 'amount' ? 'font-medium tabular-nums' : 'whitespace-pre-wrap'}`}>
                  {field.value}
                </dd>
                <Description text={field.description} />
              </div>
            );
        }
      })}
    </dl>
  );
}
