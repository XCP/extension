import { useState } from "react";

export function Composer({
  initialTitle,
  FormComponent,
  ReviewComponent,
  composeTransaction,
  signTransaction,
}: {
  initialTitle: string;
  FormComponent: (props: { onSubmit: (data: any) => void }) => JSX.Element;
  ReviewComponent: (props: {
    apiResponse: any;
    onSign: () => void;
    onBack: () => void;
  }) => JSX.Element;
  composeTransaction: (data: any) => Promise<any>;
  signTransaction: (apiResponse: any) => Promise<void>;
}) {
  const [step, setStep] = useState<"form" | "review">("form");
  const [formData, setFormData] = useState<any>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No need for useCallback – just plain functions!
  async function handleFormSubmit(data: any) {
    setIsLoading(true);
    setError(null);
    try {
      const response = await composeTransaction(data);
      setApiResponse(response);
      setFormData(data);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSign() {
    setIsLoading(true);
    setError(null);
    try {
      await signTransaction(apiResponse);
      // In a real app you might navigate or show a success screen
      alert("Transaction signed successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  function handleBack() {
    setApiResponse(null);
    setStep("form");
  }

  return (
    <div>
      <h2>{initialTitle}</h2>
      {isLoading && <div>Loading…</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
      {step === "form" && <FormComponent onSubmit={handleFormSubmit} />}
      {step === "review" && apiResponse && (
        <ReviewComponent
          apiResponse={apiResponse}
          onSign={handleSign}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
