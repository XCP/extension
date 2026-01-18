import { type ReactElement } from "react";

interface Tab {
  id: string;
  label: string;
}

interface SectionHeaderProps {
  title?: string;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  action?: ReactElement;
  className?: string;
}

/**
 * SectionHeader displays a section title with optional tabs or action buttons.
 * Title is optional - useful for pages where the page header provides context.
 */
export function SectionHeader({
  title,
  tabs,
  activeTab,
  onTabChange,
  action,
  className = "",
}: SectionHeaderProps): ReactElement {
  return (
    <div className={`flex items-center justify-between mb-2 ${className}`}>
      {title ? (
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      ) : (
        <div />
      )}
      {tabs && tabs.length > 0 && onTabChange && (
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                activeTab === tab.id
                  ? "bg-gray-200 text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {action && !tabs && action}
    </div>
  );
}
