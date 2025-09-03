"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer-form";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { DispenserInput, type DispenserOption } from "@/components/inputs/dispenser-input";
import { useComposer } from "@/contexts/composer-context";
import { 
  fetchAssetDetailsAndBalance, 
  type DispenseOptions 
} from "@/utils/blockchain/counterparty";
import { formatAmount } from "@/utils/format";
import { 
  multiply, 
  subtract, 
  divide, 
  roundUp, 
  roundDown, 
  isLessThanOrEqualToZero, 
  toNumber 
} from "@/utils/numeric";
import type { ReactElement } from "react";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface DispenseFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenseOptions | null;
}

// ============================================================================
// Constants
// ============================================================================

const AVERAGE_TX_SIZE_VBYTES = 250;
const FEE_SAFETY_MARGIN = 1.75;
const DEFAULT_FEE_RATE = 1; // sats per vbyte
const SATOSHIS_PER_BTC = 1e8;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate the maximum number of dispenses based on BTC balance and fees
 */
function calculateMaximumDispenses(
  satoshirate: number,
  btcBalance: string,
  feeRate: number
): number {
  if (!satoshirate) return 0;
  
  const balanceInSatoshis = multiply(btcBalance, SATOSHIS_PER_BTC);
  const estimatedFee = multiply(AVERAGE_TX_SIZE_VBYTES, feeRate);
  const totalFeeReserve = roundUp(multiply(estimatedFee, FEE_SAFETY_MARGIN));
  const availableForDispenses = subtract(balanceInSatoshis, totalFeeReserve);
  
  if (isLessThanOrEqualToZero(availableForDispenses)) return 0;
  
  return toNumber(roundDown(divide(availableForDispenses, satoshirate)));
}

/**
 * Calculate remaining dispenses for a dispenser
 */
function calculateRemainingDispenses(dispenser: any): number {
  return toNumber(
    roundDown(
      divide(dispenser.give_remaining_normalized, dispenser.give_quantity_normalized)
    )
  );
}

// ============================================================================
// Custom Hooks
// ============================================================================

/**
 * Custom hook to manage BTC balance
 */
function useBtcBalance(address: string | undefined) {
  const [balance, setBalance] = useState("0");

  useEffect(() => {
    const fetchBalance = async () => {
      if (!address) return;
      
      try {
        const { availableBalance } = await fetchAssetDetailsAndBalance("BTC", address);
        setBalance(availableBalance);
      } catch (err) {
        console.error("Failed to fetch BTC balance:", err);
        setBalance("0");
      }
    };

    fetchBalance();
  }, [address]);

  return balance;
}

// ============================================================================
// Main Component
// ============================================================================

export function DispenseForm({ 
  formAction, 
  initialFormData
}: DispenseFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, settings, showHelpText, state } = useComposer();
  const { pending } = useFormStatus();
  const feeRate = initialFormData?.sat_per_vbyte || DEFAULT_FEE_RATE;
  
  // State management
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dispenserAddress, setDispenserAddress] = useState(
    initialFormData?.dispenser || ""
  );
  const [selectedDispenserIndex, setSelectedDispenserIndex] = useState<number | null>(() => {
    const formData = initialFormData as any;
    return formData?.selectedDispenserIndex !== undefined 
      ? Number(formData.selectedDispenserIndex) 
      : null;
  });
  const [selectedDispenser, setSelectedDispenser] = useState<DispenserOption | null>(null);
  const [dispenserError, setDispenserError] = useState<string | null>(null);
  const [isLoadingDispensers, setIsLoadingDispensers] = useState(false);
  
  const [numberOfDispenses, setNumberOfDispenses] = useState(() => {
    if (initialFormData?.quantity) {
      const formData = initialFormData as any;
      if (formData.satoshirate && Number(formData.satoshirate) > 0) {
        return toNumber(
          roundDown(divide(initialFormData.quantity, formData.satoshirate))
        ).toString();
      }
    }
    return "1";
  });

  // Custom hooks
  const btcBalance = useBtcBalance(activeAddress?.address);

  // Refs
  const previousIndexRef = useRef<number | null>(null);
  const hasSetInitialDispenses = useRef(false);

  // Calculate max dispenses for current selection
  const maxDispenses = (() => {
    if (!selectedDispenser) return 0;
    
    const affordableDispenses = calculateMaximumDispenses(
      selectedDispenser.satoshirate,
      btcBalance,
      feeRate
    );
    
    const remainingDispenses = calculateRemainingDispenses(
      selectedDispenser.dispenser
    );
    
    return Math.min(affordableDispenses, remainingDispenses);
  })();

  // Set composer error
  useEffect(() => {
    if (state.error) {
      setValidationError(state.error);
    }
  }, [state.error]);

  // Focus input on mount
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      "input[name='dispenserAddress']"
    );
    input?.focus();
  }, []);

  // Set initial dispenses from form data (once)
  useEffect(() => {
    if (
      !hasSetInitialDispenses.current &&
      selectedDispenser &&
      initialFormData?.quantity &&
      selectedDispenserIndex !== null
    ) {
      const formData = initialFormData as any;
      if (formData.satoshirate && Number(formData.satoshirate) > 0) {
        const calculatedDispenses = toNumber(
          roundDown(divide(initialFormData.quantity, formData.satoshirate))
        ).toString();
        setNumberOfDispenses(calculatedDispenses);
        hasSetInitialDispenses.current = true;
      }
    }
  }, [selectedDispenser, selectedDispenserIndex, initialFormData]);

  // Validate and adjust dispenses when switching dispensers
  useEffect(() => {
    if (
      selectedDispenserIndex !== null &&
      previousIndexRef.current !== null &&
      selectedDispenserIndex !== previousIndexRef.current &&
      selectedDispenser
    ) {
      const currentNumber = parseInt(numberOfDispenses) || 1;
      
      // Check against new max
      if (currentNumber > maxDispenses && maxDispenses > 0) {
        setNumberOfDispenses(maxDispenses.toString());
        setValidationError(null);
      }
      
      // Check if dispenser is empty
      const remainingDispenses = calculateRemainingDispenses(
        selectedDispenser.dispenser
      );
      if (remainingDispenses === 0) {
        setValidationError("This dispenser is empty and cannot be triggered.");
      }
    }
    previousIndexRef.current = selectedDispenserIndex;
  }, [selectedDispenserIndex, selectedDispenser, numberOfDispenses, maxDispenses]);

  // Handle max button click
  const handleMaxClick = useCallback(() => {
    if (!selectedDispenser) {
      setValidationError("Please select a dispenser first");
      return;
    }

    if (maxDispenses === 0) {
      const remainingDispenses = calculateRemainingDispenses(
        selectedDispenser.dispenser
      );
      
      if (remainingDispenses === 0) {
        setValidationError("This dispenser is empty and cannot be triggered.");
      } else {
        const requiredBTC = selectedDispenser.satoshirate / SATOSHIS_PER_BTC;
        setValidationError(`Insufficient BTC balance. You need at least ${formatAmount({
            value: requiredBTC,
            minimumFractionDigits: 8,
            maximumFractionDigits: 8
          })} BTC to trigger this dispenser once.`);
      }
      return;
    }

    setNumberOfDispenses(maxDispenses.toString());
    setValidationError(null);
  }, [selectedDispenser, maxDispenses]);

  // Handle dispenser selection change
  const handleDispenserSelectionChange = useCallback((index: number | null, option: DispenserOption | null) => {
    setSelectedDispenserIndex(index);
    setSelectedDispenser(option);
  }, []);

  // Combined error message - validation errors and dispenser fetch errors
  const errorMessage = validationError || dispenserError || null;

  return (
    <ComposerForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader 
            address={activeAddress.address} 
            walletName={activeWallet?.name} 
            className="mt-1 mb-5" 
          />
        )
      }
    >
          {/* Local validation errors */}
          {errorMessage && (
            <ErrorAlert
              message={errorMessage}
              onClose={() => setValidationError(null)}
            />
          )}

          {/* Dispenser Input Component */}
          <DispenserInput
            value={dispenserAddress}
            onChange={setDispenserAddress}
            selectedIndex={selectedDispenserIndex}
            onSelectionChange={handleDispenserSelectionChange}
            initialFormData={initialFormData}
            disabled={pending}
            showHelpText={showHelpText}
            required={true}
            onError={setDispenserError}
            onLoadingChange={setIsLoadingDispensers}
          />

          {/* Times to Dispense Input */}
          {selectedDispenser && !isLoadingDispensers && (
            <>
              <AmountWithMaxInput
                asset="Dispenses"
                availableBalance={btcBalance}
                value={numberOfDispenses}
                onChange={setNumberOfDispenses}
                sat_per_vbyte={feeRate}
                setError={setValidationError}
                showHelpText={showHelpText}
                sourceAddress={activeAddress}
                maxAmount={maxDispenses.toString()}
                label="Times to Dispense"
                name="numberOfDispenses"
                description="Number of times to trigger the dispenser"
                disabled={pending}
                onMaxClick={handleMaxClick}
                disableMaxButton={false}
                hasError={!!errorMessage}
              />

              {/* Hidden input to convert numberOfDispenses to quantity for the API */}
              <input
                type="hidden"
                name="quantity"
                value={
                  selectedDispenser
                    ? Number(numberOfDispenses) * selectedDispenser.satoshirate
                    : 0
                }
              />
            </>
          )}

    </ComposerForm>
  );
}