import { FaSpinner } from 'react-icons/fa';

interface LoadingProps {
  message?: string;
  className?: string;
}

export function Loading({ message = 'Loading...', className = '' }: LoadingProps) {
  return (
    <div className={`flex flex-col items-center justify-center space-y-4 ${className}`}>
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      {message && (
        <p className="text-gray-600 text-center font-medium">{message}</p>
      )}
    </div>
  );
} 