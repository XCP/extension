import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { type ApiStatusEvent, type ApiStatusType, clearApiStatus, subscribeApiStatus } from '@/core/api-status';

interface ApiStatusContextValue {
  status: ApiStatusType;
  statusCode?: number;
  message?: string;
  retryAfter?: number;
  dismiss: () => void;
}

const ApiStatusContext = createContext<ApiStatusContextValue | null>(null);

/**
 * Provider that subscribes to API status events and exposes them to React components.
 */
export function ApiStatusProvider({ children }: { children: ReactNode }): ReactElement {
  const [event, setEvent] = useState<ApiStatusEvent>({ type: null });

  useEffect(() => {
    return subscribeApiStatus(setEvent);
  }, []);

  const dismiss = useCallback(() => {
    clearApiStatus();
  }, []);

  const value: ApiStatusContextValue = {
    status: event.type,
    statusCode: event.statusCode,
    message: event.message,
    retryAfter: event.retryAfter,
    dismiss,
  };

  return (
    <ApiStatusContext.Provider value={value}>
      {children}
    </ApiStatusContext.Provider>
  );
}

/**
 * Hook to access API status state.
 */
export function useApiStatus(): ApiStatusContextValue {
  const context = useContext(ApiStatusContext);
  if (!context) {
    throw new Error('useApiStatus must be used within an ApiStatusProvider');
  }
  return context;
}
