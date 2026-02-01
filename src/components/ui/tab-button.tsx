import { type ReactElement, type ReactNode } from "react";

interface TabButtonProps {
  children: ReactNode;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * A reusable tab button with consistent styling.
 * Used for secondary tab navigation within pages.
 */
export function TabButton({
  children,
  isActive,
  onClick,
  className = "",
}: TabButtonProps): ReactElement {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isActive
          ? "bg-gray-200 text-gray-900 font-medium"
          : "text-gray-500 hover:text-gray-700"
      } ${className}`}
    >
      {children}
    </button>
  );
}
