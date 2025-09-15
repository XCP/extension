import { type ReactElement, type ReactNode } from "react";
import { ActionCard } from "@/components/cards/action-card";

/**
 * Props interface for an individual action item
 */
export interface ActionItem {
  /** Unique identifier for the action */
  id: string;
  /** The primary title/name of the action */
  title: string;
  /** Optional description text shown below the title */
  description?: string;
  /** Click handler for the action */
  onClick: () => void;
  /** Optional icon to display on the left side */
  icon?: ReactNode;
  /** Whether to show the chevron right indicator - defaults to true */
  showChevron?: boolean;
  /** Optional custom CSS classes for the card */
  className?: string;
  /** Optional aria-label for accessibility */
  ariaLabel?: string;
  /** Whether to show a notification badge */
  showNotification?: boolean;
}

/**
 * Props interface for an action section
 */
export interface ActionSection {
  /** Optional section title/header */
  title?: string;
  /** Array of action items in this section */
  items: ActionItem[];
  /** Optional custom CSS classes for the section */
  className?: string;
}

/**
 * Props interface for the ActionList component
 */
interface ActionListProps {
  /** Array of sections containing action items */
  sections: ActionSection[];
  /** Optional custom CSS classes for the container */
  className?: string;
  /** Optional custom spacing between sections */
  sectionSpacing?: string;
  /** Optional custom spacing between items within a section */
  itemSpacing?: string;
}

/**
 * ActionList Component
 * 
 * A reusable list component for displaying grouped action items with consistent styling.
 * Used for settings screens, action menus, and other navigation interfaces.
 * 
 * Features:
 * - Section headers with customizable styling
 * - Consistent spacing and layout
 * - Accessible structure with proper ARIA labels
 * - Flexible configuration for different use cases
 * 
 * @param props - The component props
 * @returns A ReactElement representing the action list
 * 
 * @example
 * ```tsx
 * <ActionList
 *   sections={[
 *     {
 *       title: "Account",
 *       items: [
 *         {
 *           id: "profile",
 *           title: "Profile Settings",
 *           description: "Update your profile information",
 *           onClick: () => navigate('/profile')
 *         }
 *       ]
 *     },
 *     {
 *       title: "Security", 
 *       items: [...]
 *     }
 *   ]}
 * />
 * ```
 */
export function ActionList({
  sections,
  className = "space-y-6",
  sectionSpacing = "space-y-6",
  itemSpacing = "space-y-2"
}: ActionListProps): ReactElement {
  return (
    <div className={className}>
      <div className={sectionSpacing}>
        {sections.map((section, sectionIndex) => (
          <div 
            key={section.title || `section-${sectionIndex}`} 
            className={`${itemSpacing} ${section.className || ""}`}
          >
            {/* Section Header */}
            {section.title && (
              <h2 className="text-sm font-medium text-gray-500 px-4 mb-2">
                {section.title}
              </h2>
            )}
            
            {/* Section Items */}
            <div className={itemSpacing}>
              {section.items.map((item) => (
                <ActionCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  onClick={item.onClick}
                  icon={item.icon}
                  showChevron={item.showChevron}
                  className={item.className}
                  ariaLabel={item.ariaLabel}
                  showNotification={item.showNotification}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ActionList;