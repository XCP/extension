import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  Dispatch,
  SetStateAction,
} from "react";
import {
  SendOptions,
  BetOptions,
  BroadcastOptions,
  BTCPayOptions,
  BurnOptions,
  CancelOptions,
  DestroyOptions,
  DispenserOptions,
  DispenseOptions,
  DividendOptions,
  IssuanceOptions,
  MPMAOptions,
  OrderOptions,
  SweepOptions,
  FairminterOptions,
  FairmintOptions,
  AttachOptions,
  DetachOptions,
  MoveOptions,
  ApiResponse as BaseApiResponse,
} from "@/utils/blockchain/counterparty";
import { TransactionResponse } from "@/utils/blockchain/bitcoin";

interface ApiResponse extends BaseApiResponse {
  broadcast?: TransactionResponse;
}

export type FormDataType =
  | SendOptions
  | BetOptions
  | BroadcastOptions
  | BTCPayOptions
  | BurnOptions
  | CancelOptions
  | DestroyOptions
  | DispenserOptions
  | DispenseOptions
  | DividendOptions
  | IssuanceOptions
  | MPMAOptions
  | OrderOptions
  | SweepOptions
  | FairminterOptions
  | FairmintOptions
  | AttachOptions
  | DetachOptions
  | MoveOptions;

interface ComposerContextType {
  step: "form" | "review" | "success";
  setStep: Dispatch<SetStateAction<"form" | "review" | "success">>;
  formData: FormDataType | null;
  setFormData: Dispatch<SetStateAction<FormDataType | null>>;
  apiResponse: ApiResponse | null;
  setApiResponse: Dispatch<SetStateAction<ApiResponse | null>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  reset: () => void;
}

const ComposerContext = createContext<ComposerContextType | undefined>(undefined);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<"form" | "review" | "success">("form");
  const [formData, setFormData] = useState<FormDataType | null>(null);
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("form");
    setFormData(null);
    setApiResponse(null);
    setError(null);
  };

  const value: ComposerContextType = {
    step,
    setStep,
    formData,
    setFormData,
    apiResponse,
    setApiResponse,
    error,
    setError,
    reset,
  };

  return (
    <ComposerContext.Provider value={value}>
      {children}
    </ComposerContext.Provider>
  );
}

export function useComposer() {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return context;
}
