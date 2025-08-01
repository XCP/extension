import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { ConsolidationForm, ConsolidationFormData } from "./form";
import { ConsolidationReview } from "./review";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useConsolidateAndBroadcast } from "@/hooks/useConsolidateAndBroadcast";

export function Consolidate() {
  const navigate = useNavigate();
  const { activeAddress, activeWallet } = useWallet();
  const { consolidateAndBroadcast, isProcessing } = useConsolidateAndBroadcast();
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [error, setError] = useState<string | null>(null);
  // Use the form data type that includes utxoData
  const [formData, setFormData] = useState<ConsolidationFormData | null>(null);
  const [txDetails, setTxDetails] = useState<any>(null);
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();

  const toggleHelp = () => {
    updateSettings({ showHelpText: !settings?.showHelpText });
  };

  useEffect(() => {
    if (step === 'form') {
      setHeaderProps({
        title: "Recovery Tool",
        onBack: () => navigate(-1),
        rightButton: {
          icon: <FiHelpCircle className="w-4 h-4" />,
          onClick: toggleHelp,
          ariaLabel: "Toggle help text",
        },
      });
    } else if (step === 'review') {
      setHeaderProps({
        title: "Review",
        onBack: () => setStep('form'),
      });
    }
    return () => setHeaderProps(null);
  }, [step, setHeaderProps, navigate]);

  if (!activeAddress || !activeWallet) return null;

  const handleFormSubmit = async (data: ConsolidationFormData) => {
    try {
      setError(null);
      // Store form data (including utxoData)
      setFormData(data);
      
      // Pass extra data (utxoData) to the review screen
      setTxDetails({
        params: {
          source: activeAddress.address,
          destination: data.destinationAddress || activeAddress.address,
          feeRateSatPerVByte: data.feeRateSatPerVByte,
        },
        utxoData: data.utxoData, // <-- extra info for review
      });

      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBack = () => {
    setStep('form');
    setTxDetails(null);
  };

  const handleSign = async () => {
    if (!formData) return;
    
    try {
      setError(null);
      await consolidateAndBroadcast(
        formData.feeRateSatPerVByte,
        formData.destinationAddress
      );
      // Handle success (e.g., navigate away or show success message)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="p-4">
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {step === 'form' && (
        <ConsolidationForm onSubmit={handleFormSubmit} />
      )}

      {step === 'review' && txDetails && (
        <ConsolidationReview
          apiResponse={txDetails}
          onSign={handleSign}
          onBack={handleBack}
          error={error}
          setError={setError}
        />
      )}
    </div>
  );
}

export default Consolidate;
