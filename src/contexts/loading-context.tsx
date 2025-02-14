import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  message: string;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

// Timeout in milliseconds before auto-hiding the loading state
const AUTO_HIDE_TIMEOUT = 30000; // 30 seconds

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  let timeoutId: number | undefined;

  useEffect(() => {
    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const showLoading = (message = 'Loading...') => {
    // When showing loading, prevent background scrolling
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    
    setMessage(message);
    setIsLoading(true);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      console.warn('Loading state auto-hidden after timeout');
      hideLoading();
    }, AUTO_HIDE_TIMEOUT);
  };

  const hideLoading = () => {
    // Re-enable scrolling when hiding loading
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    setIsLoading(false);
    setMessage('');
  };

  return (
    <LoadingContext.Provider value={{ isLoading, message, showLoading, hideLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
} 