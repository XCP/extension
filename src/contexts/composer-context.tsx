import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  Dispatch,
  SetStateAction,
} from "react";

interface ComposerContextType {
  step: "form" | "review" | "success";
  setStep: Dispatch<SetStateAction<"form" | "review" | "success">>;
  formData: any;
  setFormData: Dispatch<SetStateAction<any>>;
  apiResponse: any;
  setApiResponse: Dispatch<SetStateAction<any>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
}

const ComposerContext = createContext<ComposerContextType | undefined>(
  undefined
);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<"form" | "review" | "success">("form");
  const [formData, setFormData] = useState<any>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null); // explicitly typed

  const value: ComposerContextType = {
    step,
    setStep,
    formData,
    setFormData,
    apiResponse,
    setApiResponse,
    error,
    setError,
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
