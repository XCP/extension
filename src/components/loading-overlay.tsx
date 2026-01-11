import { type ReactElement } from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  fullScreen?: boolean;
}

/**
 * LoadingOverlay displays a semi-transparent overlay with a loading spinner.
 * Can be used locally in any component without global state.
 *
 * @param props - The component props
 * @returns A ReactElement representing the loading overlay, or null if not loading
 */
export function LoadingOverlay({
  isLoading,
  message = "Loading...",
  fullScreen = true
}: LoadingOverlayProps): ReactElement | null {
  if (!isLoading) return null;

  const positionClass = fullScreen
    ? "fixed inset-0"
    : "absolute inset-0";

  return (
    <div className={`${positionClass} bg-black/50 backdrop-blur-sm flex items-center justify-center z-50`}>
      <div className="bg-white rounded-lg p-6 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="text-gray-700">{message}</span>
        </div>
      </div>
    </div>
  );
}