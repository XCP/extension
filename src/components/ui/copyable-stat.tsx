import { type ReactElement } from "react";
import { FaCheck } from "@/components/icons";

interface CopyableStatProps {
  label: string;
  value: string;
  rawValue: string;
  onCopy: (value: string) => void;
  isCopied: boolean;
}

/**
 * Copyable stat display with highlight feedback.
 * Shows a label and value that can be clicked to copy.
 */
export function CopyableStat({
  label,
  value,
  rawValue,
  onCopy,
  isCopied,
}: CopyableStatProps): ReactElement {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCopy(rawValue);
    }
  };

  return (
    <div>
      <span className="text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <div
          onClick={() => onCopy(rawValue)}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          className={`font-medium text-gray-900 truncate cursor-pointer rounded px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isCopied ? "bg-gray-200" : ""}`}
        >
          <span>{value}</span>
        </div>
        {isCopied && <FaCheck className="size-3 text-green-500 flex-shrink-0" aria-hidden="true" />}
      </div>
    </div>
  );
}
