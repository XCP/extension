import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  use,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * State for a loading instance.
 */
interface LoadingState {
  id: string;
  message?: string;
  timestamp: number;
}

/**
 * Context type for loading state management.
 */
interface LoadingContextType {
  showLoading: (message?: string, options?: { onError?: (err: Error) => void }) => string;
  hideLoading: (id: string) => void;
  isLoading: boolean;
  currentMessage?: string;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

const AUTO_HIDE_TIMEOUT = 30_000; // 30 seconds

/**
 * Props for LoadingProvider.
 */
interface LoadingProviderProps {
  children: ReactNode;
  disableScroll?: boolean;
}

/**
 * Provides loading context and manages global loading states using React 19's <Context>.
 * @param {LoadingProviderProps} props - Component props
 * @returns {ReactElement} Context provider with loading management
 */
export function LoadingProvider({
  children,
  disableScroll = true,
}: LoadingProviderProps): ReactElement {
  const [loadingCount, setLoadingCount] = useState(0);
  const [currentMessage, setCurrentMessage] = useState<string | undefined>(undefined);
  const loadingStatesRef = useRef<Map<string, LoadingState>>(new Map());
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const errorCallbacksRef = useRef<Map<string, (err: Error) => void>>(new Map());
  const updatePendingRef = useRef(false);

  useEffect(() => {
    if (disableScroll) {
      document.body.style.overflow = loadingCount > 0 ? "hidden" : "";
    }
    return () => {
      if (disableScroll) document.body.style.overflow = "";
    };
  }, [loadingCount, disableScroll]);

  const updateLoadingState = useCallback(() => {
    if (updatePendingRef.current) return;
    updatePendingRef.current = true;

    requestAnimationFrame(() => {
      const remainingStates = Array.from(loadingStatesRef.current.values());
      setLoadingCount(remainingStates.length);
      setCurrentMessage(remainingStates[0]?.message);
      updatePendingRef.current = false;
    });
  }, []);

  const showLoading = useCallback(
    (message = "Loading...", options: { onError?: (err: Error) => void } = {}): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      loadingStatesRef.current.set(id, { id, message, timestamp: Date.now() });
      if (options.onError) errorCallbacksRef.current.set(id, options.onError);

      const timeout = setTimeout(() => {
        console.warn(`Loading state "${message}" auto-hidden after ${AUTO_HIDE_TIMEOUT}ms`);
        hideLoading(id);
      }, AUTO_HIDE_TIMEOUT);
      timeoutsRef.current.set(id, timeout);

      updateLoadingState();
      return id;
    },
    [updateLoadingState]
  );

  const hideLoading = useCallback(
    (id: string): void => {
      const timeout = timeoutsRef.current.get(id);
      if (timeout) {
        clearTimeout(timeout);
        timeoutsRef.current.delete(id);
      }
      loadingStatesRef.current.delete(id);
      errorCallbacksRef.current.delete(id);
      updateLoadingState();
    },
    [updateLoadingState]
  );

  const contextValue: LoadingContextType = {
    showLoading,
    hideLoading,
    isLoading: loadingCount > 0,
    currentMessage,
  };

  return <LoadingContext value={contextValue}>{children}</LoadingContext>;
}

/**
 * Hook to access loading context using React 19's `use`.
 * @returns {LoadingContextType} Loading context value
 * @throws {Error} If used outside LoadingProvider
 */
export function useLoading(): LoadingContextType {
  const context = use(LoadingContext);
  if (!context) throw new Error("useLoading must be used within a LoadingProvider");
  return context;
}

