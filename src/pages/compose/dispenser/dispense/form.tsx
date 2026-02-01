import { useEffect, useState, useRef, useCallback } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AddressHeader } from "@/components/ui/headers/address-header";
import { AmountWithMaxInput } from "@/components/ui/inputs/amount-with-max-input";
import { DispenserInput, type DispenserOption } from "@/components/ui/inputs/dispenser-input";
import { useComposer } from "@/contexts/composer-context";
import { selectUtxosForTransaction } from "@/utils/blockchain/counterparty/utxo-selection";
import { estimateVsize } from "@/utils/blockchain/bitcoin/fee-estimation";
import type { DispenseOptions } from "@/utils/blockchain/counterparty/compose";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import {
  subtract,
  divide,
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

const SATOSHIS_PER_BTC = 1e8;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate the maximum number of dispenses based on spendable balance and fees
 */
function calculateMaximumDispenses(
  satoshirate: number,
  spendableBalance: number,
  estimatedFee: number
): number {
  if (!satoshirate || satoshirate <= 0) return 0;

  const availableForDispenses = subtract(spendableBalance.toString(), estimatedFee.toString());

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

interface SpendableBtcData {
  /** Spendable balance in BTC as formatted string */
  balance: string;
  /** Spendable balance in satoshis */
  balanceSatoshis: number;
  /** Number of spendable UTXOs */
  utxoCount: number;
  /** Number of UTXOs excluded due to attached assets */
  excludedWithAssets: number;
  /** Whether data is being loaded */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
}

/**
 * Custom hook to manage spendable BTC balance (excludes UTXOs with attached assets)
 */
function useSpendableBtc(address: string | undefined): SpendableBtcData {
  const [data, setData] = useState<SpendableBtcData>({
    balance: "0",
    balanceSatoshis: 0,
    utxoCount: 0,
    excludedWithAssets: 0,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    const fetchSpendableBalance = async () => {
      if (!address) return;

      setData(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const { utxos, totalValue, excludedWithAssets } = await selectUtxosForTransaction(
          address,
          { allowUnconfirmed: true }
        );

        const balanceBtc = fromSatoshis(totalValue.toString(), true);
        const formattedBalance = formatAmount({
          value: balanceBtc,
          maximumFractionDigits: 8,
          minimumFractionDigits: 8,
        });

        setData({
          balance: formattedBalance,
          balanceSatoshis: totalValue,
          utxoCount: utxos.length,
          excludedWithAssets,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error("Failed to fetch spendable BTC:", err);
        setData({
          balance: "0",
          balanceSatoshis: 0,
          utxoCount: 0,
          excludedWithAssets: 0,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to fetch balance",
        });
      }
    };

    fetchSpendableBalance();
  }, [address]);

  return data;
}

// ============================================================================
// Main Component
// ============================================================================

export function DispenseForm({ 
  formAction, 
  initialFormData
}: DispenseFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, showHelpText, state, feeRate } = useComposer();
  const { pending } = useFormStatus();
  
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

  // Custom hooks - fetch spendable BTC (excludes UTXOs with attached assets)
  const spendableBtc = useSpendableBtc(activeAddress?.address);

  // Refs
  const previousIndexRef = useRef<number | null>(null);
  const hasSetInitialDispenses = useRef(false);

  // Calculate max dispenses for current selection
  const maxDispenses = (() => {
    if (!selectedDispenser || !activeAddress?.address || spendableBtc.isLoading) return 0;
    if (spendableBtc.utxoCount === 0) return 0;

    // Calculate fee based on actual UTXO count and address type
    const effectiveFeeRate = feeRate ?? 0.1;
    // Dispense transaction has 1 output to dispenser
    const estimatedVbytes = estimateVsize(spendableBtc.utxoCount, 1, activeAddress.address);
    const estimatedFee = Math.ceil(estimatedVbytes * effectiveFeeRate);

    const affordableDispenses = calculateMaximumDispenses(
      selectedDispenser.satoshirate,
      spendableBtc.balanceSatoshis,
      estimatedFee
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

    if (spendableBtc.isLoading) {
      setValidationError("Loading balance...");
      return;
    }

    if (spendableBtc.error) {
      setValidationError(spendableBtc.error);
      return;
    }

    if (maxDispenses === 0) {
      const remainingDispenses = calculateRemainingDispenses(
        selectedDispenser.dispenser
      );

      if (remainingDispenses === 0) {
        setValidationError("This dispenser is empty and cannot be triggered.");
      } else if (spendableBtc.utxoCount === 0) {
        // No spendable UTXOs
        const message = spendableBtc.excludedWithAssets > 0
          ? `No spendable balance. ${spendableBtc.excludedWithAssets} UTXOs have attached assets.`
          : "No available balance.";
        setValidationError(message);
      } else {
        // Calculate fee for error message
        const effectiveFeeRate = feeRate ?? 0.1;
        const estimatedVbytes = estimateVsize(spendableBtc.utxoCount || 1, 1, activeAddress?.address || "");
        const estimatedFee = Math.ceil(estimatedVbytes * effectiveFeeRate);
        const requiredSatoshis = selectedDispenser.satoshirate + estimatedFee;
        const requiredBTC = requiredSatoshis / SATOSHIS_PER_BTC;
        setValidationError(`Insufficient BTC balance. You need at least ${formatAmount({
            value: requiredBTC,
            minimumFractionDigits: 8,
            maximumFractionDigits: 8
          })} BTC (including ~${estimatedFee} sats fee) to trigger this dispenser once.`);
      }
      return;
    }

    setNumberOfDispenses(maxDispenses.toString());
    setValidationError(null);
  }, [selectedDispenser, maxDispenses, spendableBtc]);

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
              onClose={() => {
                setValidationError(null);
                // If the error is from dispenser lookup, clear the address to reset
                if (dispenserError) {
                  setDispenserAddress("");
                }
              }}
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
                availableBalance={spendableBtc.balance}
                value={numberOfDispenses}
                onChange={setNumberOfDispenses}
                feeRate={feeRate}
                setError={setValidationError}
                showHelpText={showHelpText}
                sourceAddress={activeAddress}
                maxAmount={maxDispenses.toString()}
                label="Times to Dispense"
                name="numberOfDispenses"
                description="Number of times to trigger the dispenser"
                disabled={pending || spendableBtc.isLoading}
                onMaxClick={handleMaxClick}
                disableMaxButton={spendableBtc.isLoading}
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