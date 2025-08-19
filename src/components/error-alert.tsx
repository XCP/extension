import React from 'react';
import { IoClose } from 'react-icons/io5';
import { Button } from '@/components/button';

interface ErrorAlertProps {
  message: string;
  onClose?: () => void;
}

export const ErrorAlert = ({ message, onClose }: ErrorAlertProps) => {
  return (
    <div 
      className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 relative" 
      role="alert"
      aria-live="polite"
    >
      {onClose && (
        <Button
          variant="menu"
          onClick={onClose}
          className="absolute top-2 right-2"
          aria-label="Dismiss error message"
        >
          <IoClose className="h-4 w-4 text-red-700" aria-hidden="true" />
        </Button>
      )}
      <strong className="font-bold mr-2">Error:</strong>
      <span className="block sm:inline break-all pr-6">{message}</span>
    </div>
  );
};
