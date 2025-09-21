import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { ConsolidationForm, ConsolidationFormData } from "./form";
import { ConsolidationReview } from "./review";
import { ConsolidationHistory } from "./history";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useMultiBatchConsolidation } from "@/hooks/useMultiBatchConsolidation";
import { useConsolidationHistory } from "@/hooks/useConsolidationHistory";

function Consolidate() {
  const navigate = useNavigate();
  const { activeAddress, activeWallet } = useWallet();
  const { hasHistory } = useConsolidationHistory(activeAddress?.address || '');
  const { 
    consolidateAllBatches, 
    isProcessing,
    currentBatch,
    results
  } = useMultiBatchConsolidation();
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

  // Mark the recover bitcoin page as visited
  useEffect(() => {
    if (!settings?.hasVisitedRecoverBitcoin) {
      updateSettings({ hasVisitedRecoverBitcoin: true });
    }
  }, []); // Only run once on mount
  
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
      // Store form data
      setFormData(data);
      
      // Pass consolidation data to the review screen
      setTxDetails({
        params: {
          source: activeAddress.address,
          destination: data.destinationAddress || activeAddress.address,
          feeRateSatPerVByte: data.feeRateSatPerVByte,
        },
        consolidationData: data.consolidationData,
        allBatches: data.allBatches,
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
    if (!formData || !formData.allBatches.length) return;
    
    try {
      setError(null);
      await consolidateAllBatches(
        formData.allBatches,
        formData.feeRateSatPerVByte,
        formData.destinationAddress || undefined,
        formData.includeStamps
      );
      // Navigation to success is handled by the hook
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
        <>
          <ConsolidationForm onSubmit={handleFormSubmit} hasHistory={hasHistory} />
          <ConsolidationHistory address={activeAddress.address} />
        </>
      )}

      {step === 'review' && txDetails && (
        <ConsolidationReview
          apiResponse={txDetails}
          onSign={handleSign}
          onBack={handleBack}
          error={error}
          setError={setError}
          isProcessing={isProcessing}
          currentBatch={currentBatch}
          results={results}
        />
      )}
    </div>
  );
}

export default Consolidate;
