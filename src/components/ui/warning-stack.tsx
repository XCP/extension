import type { ReactNode } from 'react';
import { Banner, type BannerSeverity } from '@/components/ui/banner';

export interface WarningItem {
  key: string;
  severity: BannerSeverity;
  /** Prioritize the actual signing blocker over unrelated signable cautions. */
  blocking?: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
}

const SEVERITY_RANK: Record<BannerSeverity, number> = { danger: 0, warning: 1, info: 2, success: 3 };

/**
 * WarningStack — renders a set of Banners in a fixed severity order
 * (danger → warning → info → success), so a positive/success banner can never
 * sit above a danger one. Within a severity, insertion order is preserved.
 * Returns a fragment, so the banners flow in the parent's vertical spacing.
 */
export function WarningStack({ items }: { items: WarningItem[] }) {
  if (items.length === 0) return null;
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] || a.index - b.index)
    .map(({ item }) => item);
  return (
    <>
      {sorted.map(({ key, severity, title, description, children }) => (
        <Banner key={key} severity={severity} title={title} description={description}>
          {children}
        </Banner>
      ))}
    </>
  );
}
