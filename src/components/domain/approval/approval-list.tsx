import { type ReactNode, useState } from 'react';
import { t } from '@/i18n';

/** Items shown before "Show all N". A list of three or fewer shows in full. */
const LIST_PREVIEW = 3;

/**
 * The first three items of a long list, then "Show all N".
 *
 * A six-item cart drew every input, output and detached balance as its own card and ran to
 * 2,000px; nothing on the screen was hidden, but nothing could be found either. The count is always
 * stated, so what is folded away is never a surprise, and one click shows every item.
 */
export function ApprovalList<T>({ items, render, className = 'space-y-2', as = 'div' }: {
  items: readonly T[];
  render: (item: T, index: number) => ReactNode;
  className?: string;
  as?: 'div' | 'ul';
}) {
  const [expanded, setExpanded] = useState(false);
  const folded = !expanded && items.length > LIST_PREVIEW;
  const visible = folded ? items.slice(0, LIST_PREVIEW) : items;
  const List = as;
  return (
    <>
      <List className={className}>{visible.map(render)}</List>
      {items.length > LIST_PREVIEW && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          className="mt-1.5 cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          {expanded ? t('approval_list_show_fewer') : t('approval_list_show_all', [String(items.length)])}
        </button>
      )}
    </>
  );
}
