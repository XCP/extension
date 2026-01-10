import { type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/button";

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * EmptyState displays a message when no content is available.
 * Optionally includes an icon and action button.
 */
export function EmptyState({
  message,
  icon,
  action,
  className = "",
}: EmptyStateProps): ReactElement {
  return (
    <div className={`bg-gray-50 rounded-lg p-6 text-center ${className}`}>
      {icon && <div className="mb-2 text-gray-400">{icon}</div>}
      <div className="text-gray-500 text-sm">{message}</div>
      {action && (
        <Button onClick={action.onClick} color="blue" className="mt-3">
          {action.label}
        </Button>
      )}
    </div>
  );
}
