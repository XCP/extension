import React, { type ReactElement } from 'react';
import { FaSpinner } from 'react-icons/fa';

interface SpinnerProps {
  className?: string;
  message?: string;
}

export function Spinner({ className = '', message }: SpinnerProps): ReactElement {
  return (
    <div className={`flex flex-col items-center justify-center h-full ${className}`}>
      <FaSpinner className="animate-spin text-4xl text-blue-500" />
      {message && <p className="mt-4 text-gray-600 text-center font-medium">{message}</p>}
    </div>
  );
}
