import { type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
  /** Button-style action */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Link-style action (displayed below the empty state box) */
  linkAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * EmptyState displays a message when no content is available.
 * Optionally includes an icon and action button or link.
 */
export function EmptyState({
  message,
  icon,
  action,
  linkAction,
  className = "",
}: EmptyStateProps): ReactElement {
  return (
    <>
      <div className={`bg-gray-50 rounded-lg p-6 text-center ${className}`}>
        {icon && <div className="mb-2 text-gray-400">{icon}</div>}
        <div className="text-gray-500 text-sm">{message}</div>
        {action && (
          <Button onClick={action.onClick} color="blue" className="mt-3">
            {action.label}
          </Button>
        )}
      </div>
      {linkAction && (
        <button
          onClick={linkAction.onClick}
          className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          {linkAction.label}
        </button>
      )}
    </>
  );
}
