import { type ReactElement, type ReactNode } from "react";
import { RadioGroup } from "@headlessui/react";
import { FaCheck } from "@/components/icons";

/**
 * Props interface for the SelectionCard component
 */
interface SelectionCardProps<T = any> {
  /** The value this card represents */
  value: T;
  /** The primary title/label for the selection */
  title: string;
  /** Optional description or subtitle */
  description?: string;
  /** Whether this option is disabled */
  disabled?: boolean;
  /** Optional message to show when disabled */
  disabledReason?: string;
  /** Optional icon to display */
  icon?: ReactNode;
  /** Whether to show a check mark when selected */
  showCheckmark?: boolean;
  /** Optional custom content to render */
  children?: ReactNode;
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * SelectionCard Component
 * 
 * A reusable card component for radio and checkbox selections.
 * Designed to work with HeadlessUI's RadioGroup and Listbox components.
 * 
 * Features:
 * - Visual feedback for selected state
 * - Disabled state with optional reason
 * - Customizable content with title and description
 * - Check mark indicator for selected items
 * - Keyboard accessible through HeadlessUI
 * 
 * @param props - The component props
 * @returns A ReactElement representing the selection card
 * 
 * @example
 * ```tsx
 * <RadioGroup value={selected} onChange={setSelected}>
 *   <SelectionCard
 *     value="option1"
 *     title="Option 1"
 *     description="Description for option 1"
 *   />
 * </RadioGroup>
 * ```
 */
export function SelectionCard<T = any>({
  value,
  title,
  description,
  disabled = false,
  disabledReason,
  icon,
  showCheckmark = true,
  children,
  className = ""
}: SelectionCardProps<T>): ReactElement {
  return (
    <RadioGroup.Option
      value={value}
      disabled={disabled}
      className={({ checked }) => `
        relative w-full rounded transition duration-300 p-4 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
        ${disabled
          ? "cursor-not-allowed bg-gray-100 opacity-60"
          : checked
            ? "cursor-pointer bg-white shadow-md border-2 border-blue-500"
            : "cursor-pointer bg-white hover:bg-gray-50 border-2 border-transparent"
        }
        ${className}
      `}
    >
      {({ checked }) => (
        <div className="flex items-start">
          {/* Optional Icon */}
          {icon && (
            <div className="flex-shrink-0 mr-3">
              <div className="size-5 flex items-center justify-center text-gray-600">
                {icon}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-grow min-w-0">
            <div className="flex flex-col">
              <span className={`text-sm font-medium ${disabled ? "text-gray-500" : "text-gray-900"}`}>
                {title}
              </span>
              
              {description && (
                <span className="text-xs text-gray-500 mt-1">
                  {description}
                </span>
              )}
              
              {disabled && disabledReason && (
                <span className="text-xs text-blue-500 mt-1">
                  {disabledReason}
                </span>
              )}
              
              {children}
            </div>
          </div>

          {/* Check Mark Indicator */}
          {showCheckmark && checked && !disabled && (
            <div className="flex-shrink-0 ml-3">
              <FaCheck className="size-4 text-blue-500" aria-hidden="true" />
            </div>
          )}
        </div>
      )}
    </RadioGroup.Option>
  );
}

/**
 * SelectionCardGroup Component
 * 
 * A wrapper component for grouping SelectionCard components.
 * Provides consistent spacing and layout for selection groups.
 * 
 * @example
 * ```tsx
 * <RadioGroup value={selected} onChange={setSelected}>
 *   <SelectionCardGroup>
 *     <SelectionCard value="1" title="Option 1" />
 *     <SelectionCard value="2" title="Option 2" />
 *   </SelectionCardGroup>
 * </RadioGroup>
 * ```
 */
export function SelectionCardGroup({ 
  children,
  className = "space-y-2"
}: { 
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

