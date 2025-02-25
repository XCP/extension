"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ApiResponse } from "@/utils/blockchain/counterparty";
import axios from "axios";

interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
}

interface ComposerContextType<T> {
  state: ComposerState<T>;
  error: string | null;
  isPending: boolean;
  compose: (formData: FormData, composeTransaction: (data: any) => Promise<ApiResponse>, sourceAddress?: string) => Promise<void>;
  sign: (apiResponse: ApiResponse, signFn: () => Promise<void>) => Promise<void>;
  reset: () => void;
  revertToForm: () => void; // New method
}

const ComposerContext = createContext<ComposerContextType<any> | undefined>(undefined);

export function useComposer<T>() {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context as ComposerContextType<T>;
}

interface ComposerProviderProps<T> {
  children: React.ReactNode;
  initialFormData?: T | null;
}

interface ExtendedApiResponse extends ApiResponse {
  broadcast?: { txid: string; fees?: number };
}

export function ComposerProvider<T>({ children, initialFormData = null }: ComposerProviderProps<T>) {
  const initialState: ComposerState<T> = {
    step: "form",
    formData: initialFormData,
    apiResponse: null,
  };

  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const compose = useCallback(
    async (formData: FormData, composeTransaction: (data: any) => Promise<ApiResponse>, sourceAddress?: string) => {
      setIsPending(true);
      try {
        if (!formData) throw new Error("No form data provided.");
        if (!composeTransaction) throw new Error("Compose transaction function not provided.");
        const rawData = Object.fromEntries(formData);
        const data = rawData as unknown as T;
        const response = await composeTransaction({
          ...data,
          sourceAddress,
        });
        console.log("Compose success, response:", response);
        setError(null);
        setState({
          step: "review",
          formData: data,
          apiResponse: response,
        });
      } catch (err) {
        console.error("Compose error:", err);
        let errorMessage = "An error occurred while composing the transaction.";
        if (axios.isAxiosError(err) && err.response?.data?.error) {
          errorMessage = err.response.data.error;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
        setError(errorMessage);
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  const sign = useCallback(
    async (apiResponse: ApiResponse, signFn: () => Promise<void>) => {
      setIsPending(true);
      try {
        if (!apiResponse) throw new Error("No transaction composed.");
        if (!signFn) throw new Error("Sign function not provided.");
        await signFn();
        console.log("Sign success");
        setError(null);
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
        setError(errorMessage);
      } finally {
        setIsPending(false);
      }
    },
    [state.formData]
  );

  const reset = useCallback(() => {
    setError(null);
    setState(initialState);
  }, [initialState]);

  const revertToForm = useCallback(() => {
    setError(null);
    setState((prevState) => ({
      ...prevState,
      step: "form",
      apiResponse: null, // Clear apiResponse but keep formData
    }));
  }, []);

  useEffect(() => {
    console.log("Current state:", state);
  }, [state]);

  return (
    <ComposerContext.Provider value={{ state, error, isPending, compose, sign, reset, revertToForm }}>
      {children}
    </ComposerContext.Provider>
  );
}
