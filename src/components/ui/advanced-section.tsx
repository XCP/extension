import type { ReactNode } from 'react';
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { FiChevronDown } from '@/components/icons';

interface AdvancedSectionProps {
  /** Toggle label. */
  title?: string;
  /** Fields revealed when expanded. */
  children: ReactNode;
  /** Start expanded — e.g. when an advanced field already carries a value. */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * AdvancedSection — the one progressive-disclosure primitive for forms.
 *
 * Keeps the default view calm and tucks power-user fields behind a single
 * "Advanced" toggle, so every dense form hides complexity the same way instead
 * of the current mix of ad-hoc disclosures, settings flags, and tabs.
 */
export function AdvancedSection({
  title = 'Advanced Options',
  children,
  defaultOpen = false,
  className = '',
}: AdvancedSectionProps) {
  return (
    <Disclosure defaultOpen={defaultOpen}>
      {({ open }) => (
        <div className={className}>
          <DisclosureButton className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 cursor-pointer">
            <FiChevronDown
              className={`${open ? 'rotate-180' : ''} size-4 mr-2 transition-transform`}
              aria-hidden="true"
            />
            {title}
          </DisclosureButton>
          <DisclosurePanel className="mt-2 space-y-4">
            {children}
          </DisclosurePanel>
        </div>
      )}
    </Disclosure>
  );
}
