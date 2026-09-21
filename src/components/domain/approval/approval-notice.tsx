import { FiAlertTriangle } from '@/components/icons';
import { Collapsible } from '@/components/ui/collapsible';
import type { WarningItem } from '@/components/ui/warning-stack';

/** A concrete exception belongs in the first view; its full evidence remains inspectable. */
export function ApprovalNotice({ items, blocked = false, statusLabel }: {
  items: WarningItem[];
  blocked?: boolean;
  statusLabel?: string;
}) {
  const relevant = items.filter(item => item.severity === 'warning' || item.severity === 'danger');
  const ordered = [...relevant].sort((a, b) => Number(b.severity === 'danger') - Number(a.severity === 'danger'));
  const first = ordered[0];
  if (!first && !blocked) return null;
  const danger = first?.severity === 'danger' || (blocked && !first);
  const hasDetails = ordered.length > 1 || Boolean(first?.description || first?.children);
  return (
    <section data-testid="approval-notice" className={`rounded-lg border p-3 text-sm leading-5 ${danger
      ? 'border-danger-200 bg-danger-50 text-danger-900'
      : 'border-warning-200 bg-warning-50 text-warning-900'}`}>
      <div className="flex items-start gap-2">
        <FiAlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          {blocked && <p className="mb-0.5 text-xs font-medium">{statusLabel ?? 'Signing blocked'}</p>}
          <p data-testid="approval-notice-reason" className="font-semibold">{first?.title ?? 'This request could not be verified'}</p>
          {hasDetails && (
            <Collapsible title={blocked ? 'Why signing is unavailable' : 'What to review'} className="mt-2">
              {ordered.map((item, index) => (
                <div key={item.key}>
                  {index > 0 && <p className="font-semibold">{item.title}</p>}
                  {item.description && <p>{item.description}</p>}
                  {item.children}
                </div>
              ))}
            </Collapsible>
          )}
        </div>
      </div>
    </section>
  );
}
