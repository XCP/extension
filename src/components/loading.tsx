import { FaSpinner } from 'react-icons/fa';

interface LoadingProps {
  showMessage?: boolean;
  message?: string;
}

export function Loading({ showMessage = true, message = 'Loading...' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-2">
      <FaSpinner className="w-6 h-6 text-blue-500 animate-spin" />
      {showMessage && <span className="text-gray-500">{message}</span>}
    </div>
  );
} 