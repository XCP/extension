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
 * Composer state shape.
 */
interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
}

/**
 * Context type for composer functionality.
 */
interface ComposerContextType<T> {
  state: ComposerState<T>;
  compose: (
    formData: FormData,
    composeTransaction: (data: any) => Promise<ApiResponse>,
    sourceAddress?: string
  ) => void;
  sign: (apiResponse: ApiResponse, signFn: () => Promise<void>) => void;
  reset: () => void;
  revertToForm: () => void;
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

/**
 * Hook to access composer context using React 19's `use` API.
 * @template T - Type of form data
 * @returns {ComposerContextType<T>} Composer context value
 * @throws {Error} If used outside ComposerProvider
 */
export function useComposer<T>(): ComposerContextType<T> {
  const context = React.use(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context as ComposerContextType<T>;
}

/**
 * Provides composer context for transaction composition workflow using React 19 features.
 * @template T - Type of form data
 * @param {ComposerProviderProps<T>} props - Component props
 * @returns {ReactElement} Context provider
 */
export function ComposerProvider<T>({
  children,
  initialFormData = null,
}: ComposerProviderProps<T>): ReactElement {
  const initialState: ComposerState<T> = {
    step: "form",
    formData: initialFormData,
    apiResponse: null,
  };

  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const previousStepRef = useRef<"form" | "review" | "success" | null>(null);

  // Track step changes
  useEffect(() => {
    previousStepRef.current = state.step;
  }, [state.step]);

  const compose = useCallback(
    (
      formData: FormData,
      composeTransaction: (data: any) => Promise<ApiResponse>,
      sourceAddress?: string
    ) => {
      startTransition(async () => {
        try {
          if (!formData) throw new Error("No form data provided.");
          if (!composeTransaction) throw new Error("Compose transaction function not provided.");
          const rawData = Object.fromEntries(formData);
          const data = rawData as unknown as T;
          const response = await composeTransaction({ ...data, sourceAddress });
          setState({ step: "review", formData: data, apiResponse: response });
        } catch (err) {
          console.error("Compose error:", err);
          let errorMessage = "An error occurred while composing the transaction.";
          if (axios.isAxiosError(err) && err.response?.data?.error) {
            errorMessage = err.response.data.error;
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }
          const rawData = Object.fromEntries(formData);
          const data = rawData as unknown as T;
          setState((prev) => ({ ...prev, step: "form", formData: data }));
          throw new Error(errorMessage); // Let consumers handle the error
        }
      });
    },
    []
  );

  const sign = useCallback(
    (apiResponse: ApiResponse, signFn: () => Promise<void>) => {
      startTransition(async () => {
        try {
          if (!apiResponse) throw new Error("No transaction composed.");
          if (!signFn) throw new Error("Sign function not provided.");
          await signFn();
          console.log("Sign success");
          setState({
            step: "success",
            formData: state.formData,
            apiResponse: apiResponse as ExtendedApiResponse,
          });
        } catch (err) {
          console.error("Sign error:", err);
          let errorMessage = "An error occurred while signing the transaction.";
          if (axios.isAxiosError(err) && err.response?.data?.error) {
            errorMessage = err.response.data.error;
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }
          throw new Error(errorMessage); // Let consumers handle the error
        }
      });
    },
    [state.formData]
  );

  const reset = useCallback(() => {
    console.log("Resetting composer state");
    setState({ step: "form", formData: null, apiResponse: null });
  }, []);

  const revertToForm = useCallback(() => {
    setState((prev) => ({ ...prev, step: "form", apiResponse: null }));
  }, []);

  // Reset form data when arriving at form step from non-review steps
  useEffect(() => {
    if (
      state.step === "form" &&
      previousStepRef.current !== "review" &&
      previousStepRef.current !== null
    ) {
      setState((prev) => ({ ...prev, formData: null }));
    }
  }, [state.step]);

  const value = { state, compose, sign, reset, revertToForm, isPending };

  return <ComposerContext value={value}>{children}</ComposerContext>;
}
