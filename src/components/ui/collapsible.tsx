import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import type { ReactNode } from 'react';
import { FiChevronDown } from '@/components/icons';

interface CollapsibleProps {
  /** Toggle label. */
  title: string;
  children: ReactNode;
  /** Start expanded — e.g. when a field inside already carries a value. */
  defaultOpen?: boolean;
  /**
   * 'inline' — a text toggle with a leading chevron, for tucking advanced form
   * fields away. 'card' — a white card with a full-width header and a bordered
   * panel, for detail sections on the approval / review screens.
   */
  variant?: 'inline' | 'card';
  className?: string;
  /** Match the 16px card inset used by approval screens. */
  compact?: boolean;
}

/**
 * Collapsible — the single progressive-disclosure primitive.
 *
 * Consolidates the three ways complexity was hidden across the app (a bespoke
 * approval "Transaction Details" toggle, a native <details> on the review
 * screen, and the compose-form "Advanced Options" section) into one Headless UI
 * Disclosure with an inline or card presentation.
 */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  variant = 'inline',
  className = '',
  compact = false,
}: CollapsibleProps) {
  if (variant === 'card') {
    return (
      <Disclosure defaultOpen={defaultOpen}>
        {({ open }) => (
          <div className={`bg-white rounded-lg shadow-sm ${className}`}>
            <DisclosureButton className={`w-full ${compact ? 'px-4' : 'px-6'} py-4 flex items-center gap-1.5 text-left cursor-pointer hover:opacity-70 transition-opacity focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:-outline-offset-2`}>
              <span className="text-sm font-medium text-gray-700">{title}</span>
              <FiChevronDown
                className={`${open ? 'rotate-180' : ''} size-4 text-gray-400 transition-transform`}
                aria-hidden="true"
              />
            </DisclosureButton>
            <DisclosurePanel className={`${compact ? 'px-4 space-y-3' : 'px-6 space-y-4'} pb-4 border-t border-gray-100 pt-4`}>
              {children}
            </DisclosurePanel>
          </div>
        )}
      </Disclosure>
    );
  }

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
          <DisclosurePanel className="mt-2 space-y-4">{children}</DisclosurePanel>
        </div>
      )}
    </Disclosure>
  );
}
