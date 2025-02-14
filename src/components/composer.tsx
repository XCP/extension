import { useState } from "react";
import type { ReactElement } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { useLoading } from "@/contexts/loading-context";

export function Composer({
  initialTitle,
  FormComponent,
  ReviewComponent,
  composeTransaction,
}: {
  initialTitle: string;
  FormComponent: (props: { onSubmit: (data: any) => void }) => ReactElement;
  ReviewComponent: (props: {
    apiResponse: any;
    onSign: () => void;
    onBack: () => void;
  }) => ReactElement;
  composeTransaction: (data: any) => Promise<any>;
}) {
  const { activeWallet, activeAddress, signTransaction, broadcastTransaction } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const [step, setStep] = useState<"form" | "review">("form");
  const [formData, setFormData] = useState<any>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFormSubmit(data: any) {
    showLoading("Composing transaction...");
    setError(null);
    try {
      const response = await composeTransaction(data);
      setApiResponse(response);
      setFormData(data);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      hideLoading();
    }
  }

  async function handleSign() {
    showLoading("Signing and broadcasting transaction...");
    setError(null);
    try {
      if (!apiResponse) throw new Error("No transaction composed.");
      if (!activeWallet || !activeAddress)
        throw new Error("Wallet is not properly initialized.");
      const rawTxHex = apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      await broadcastTransaction(signedTxHex);
      alert("Transaction signed successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      hideLoading();
    }
  }

  function handleBack() {
    setApiResponse(null);
    setStep("form");
  }

  return (
    <div>
      <h2>{initialTitle}</h2>
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
