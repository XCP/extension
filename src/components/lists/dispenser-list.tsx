"use client";

import React from "react";
import { DispenserCard, type DispenserOption } from "@/components/cards/dispenser-card";
import type { ReactElement } from "react";

// ============================================================================
// Types
// ============================================================================

interface DispenserListProps {
  dispensers: DispenserOption[];
  selectedIndex: number | null;
  onSelect: (index: number, option: DispenserOption) => void;
  disabled?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

// ============================================================================
// Main Component
// ============================================================================

export function DispenserList({
  dispensers,
  selectedIndex,
  onSelect,
  disabled = false,
  isLoading = false,
  error = null,
}: DispenserListProps): ReactElement | null {
  // Show loading state
  if (isLoading) {
    return (
      <div className="text-gray-500">
        Fetching dispenser details...
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="text-sm text-red-600 mt-2">
        {error}
      </div>
    );
  }

  // Show empty state
  if (dispensers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {dispensers.map((option) => (
        <DispenserCard
          key={option.index}
          option={option}
          isSelected={selectedIndex === option.index}
          onSelect={() => onSelect(option.index, option)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

// Re-export the type for convenience
export type { DispenserOption };