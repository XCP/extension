import React, { createContext, useContext, type ReactNode } from 'react';
import { ToastContainer, toast, ToastOptions } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface ToastContextValue {
  showSuccess: (message: string, options?: ToastOptions) => void;
  showError: (message: string, options?: ToastOptions) => void;
  showWarning: (message: string, options?: ToastOptions) => void;
  showInfo: (message: string, options?: ToastOptions) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const contextValue: ToastContextValue = {
    showSuccess: (message, options) => toast.success(message, options),
    showError: (message, options) => toast.error(message, options),
    showWarning: (message, options) => toast.warning(message, options),
    showInfo: (message, options) => toast.info(message, options),
    clearAll: () => toast.dismiss(),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer position="top-center" theme="colored" />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
