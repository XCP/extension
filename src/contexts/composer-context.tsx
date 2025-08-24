"use client";

import axios from "axios";
import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ApiResponse } from "@/utils/blockchain/counterparty";

/**
 * Composer state shape with error handling.
 */
interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
  error: string | null; // Add error to state
}

/**
 * Context type for composer functionality.
 */
interface ComposerContextType<T> {
  state: ComposerState<T>;
  compose: (
    formData: FormData,
    composeTransaction: (data: any) => Promise<ApiResponse>,
    sourceAddress?: string,
    loadingId?: string,
    hideLoadingFn?: (id: string) => void
  ) => void;
  sign: (apiResponse: ApiResponse, signFn: () => Promise<void>) => void;
  reset: () => void;
  revertToForm: () => void;
  clearError: () => void;
  setError: (error: string) => void;
  isPending: boolean;
}

/**
 * Props for ComposerProvider.
 */
interface ComposerProviderProps<T> {
  children: ReactNode;
  initialFormData?: T | null;
}

/**
 * Extended API response with optional broadcast data.
 */
interface ExtendedApiResponse extends ApiResponse {
  broadcast?: { txid: string; fees?: number };
}

const ComposerContext = createContext<ComposerContextType<any> | undefined>(undefined);

export function useComposer<T>(): ComposerContextType<T> {
  const context = React.use(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context as ComposerContextType<T>;
}

export function ComposerProvider<T>({
  children,
  initialFormData = null,
}: ComposerProviderProps<T>): ReactElement {
  const initialState: ComposerState<T> = {
    step: "form",
    formData: initialFormData,
    apiResponse: null,
    error: null, // Initialize error as null
  };

  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const previousStepRef = useRef<"form" | "review" | "success" | null>(null);

  useEffect(() => {
    previousStepRef.current = state.step;
  }, [state.step]);

  const compose = useCallback(
    (
      formData: FormData,
      composeTransaction: (data: any) => Promise<ApiResponse>,
      sourceAddress?: string,
      loadingId?: string,
      hideLoadingFn?: (id: string) => void
    ) => {
      startTransition(async () => {
        let shouldHideLoading = true;
        try {
          if (!formData) throw new Error("No form data provided.");
          if (!composeTransaction) throw new Error("Compose transaction function not provided.");
          const rawData = Object.fromEntries(formData);
          const data = rawData as unknown as T;
          const response = await composeTransaction({ ...data, sourceAddress });
          setState({
            step: "review",
            formData: data,
            apiResponse: response,
            error: null, // Clear error on success
          });
        } catch (err) {
          console.error("Compose error:", err);
          let errorMessage = "An error occurred while composing the transaction.";
          if (axios.isAxiosError(err) && err.response?.data?.error) {
            // Pass the API error message directly to the user
            errorMessage = err.response.data.error;
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }
          const rawData = Object.fromEntries(formData);
          const data = rawData as unknown as T;
          setState({
            step: "form",
            formData: data,
            apiResponse: null,
            error: errorMessage, // Set error in state instead of throwing
          });
          // Always hide loading on error
          if (loadingId && hideLoadingFn) {
            hideLoadingFn(loadingId);
          }
          shouldHideLoading = false;
        } finally {
          if (loadingId && hideLoadingFn && shouldHideLoading) {
            hideLoadingFn(loadingId);
          }
        }
      });
    },
    []
  );

  const sign = useCallback(
    (apiResponse: ApiResponse, signFn: () => Promise<void>) => {
      // Don't use startTransition for sign to ensure immediate error display
      const executeSign = async () => {
        try {
          if (!apiResponse) throw new Error("No transaction composed.");
          if (!signFn) throw new Error("Sign function not provided.");
          await signFn();
          console.log("Sign success");
          setState({
            step: "success",
            formData: state.formData,
            apiResponse: apiResponse as ExtendedApiResponse,
            error: null,
          });
        } catch (err) {
          console.error("Sign error:", err);
          let errorMessage = "An error occurred while signing the transaction.";
          if (axios.isAxiosError(err) && err.response?.data?.error) {
            errorMessage = err.response.data.error.replace(/\[|\]|'/g, "");
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }
          // Set error immediately without transition for immediate UI update
          setState((prev) => ({ ...prev, error: errorMessage }));
        }
      };
      
      executeSign();
    },
    [state.formData]
  );

  const reset = useCallback(() => {
    console.log("Resetting composer state");
    setState({ step: "form", formData: null, apiResponse: null, error: null });
  }, []);

  const revertToForm = useCallback(() => {
    setState((prev) => ({ ...prev, step: "form", apiResponse: null, error: null }));
  }, []);

  // Clear error when component unmounts or path changes
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Set error directly (synchronously, without transitions)
  const setError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  useEffect(() => {
    if (
      state.step === "form" &&
      previousStepRef.current !== "review" &&
      previousStepRef.current !== null
    ) {
      setState((prev) => ({ ...prev, formData: null, error: null }));
    }
  }, [state.step]);

  const value = { state, compose, sign, reset, revertToForm, clearError, setError, isPending };

  return <ComposerContext value={value}>{children}</ComposerContext>;
}
