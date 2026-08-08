import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { FairmintSummary } from "@/components/domain/asset/fairmint-summary";
import { type Fairminter, FairminterSelectInput } from "@/components/domain/asset/fairminter-select-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { BalanceHeader } from "@/components/domain/balance/balance-header";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useComposer } from "@/contexts/composer-context-object";
import type { FairmintOptions } from "@/core/counterparty/compose";
import {
  getFairminterLotCost,
  getFairminterPaymentModel,
  getMaxFairmintLots,
  getQuantityForLots,
  isPaidFairminter,
} from "@/core/counterparty/fairminterModel";
import { asDisplayUnits, divide, isGreaterThan } from "@/core/numeric";
import { useAssetDetails } from "@/hooks/useAssetDetails";

interface FairmintFormDataInternal {
  asset: string;
  /**
   * How many lots to mint, not how many tokens.
   *
   * A fairminter sells in lots — `quantity_by_price` tokens for `price` XCP — and core rejects any
   * quantity that is not a whole number of them. Asking for tokens meant asking for a number that
   * had to be a multiple of something the form only mentioned in help text, under a header showing
   * an XCP balance. Asking for lots is the same shape as the dispense form's "Times to Dispense",
   * and the quantity is derived on submit.
   */
  lots: string;
}

interface FairmintFormProps {
  formAction: (formData: FormData) => void;
  initialFormData?: FairmintOptions | null;
  asset?: string;
}

export function FairmintForm({ 
  formAction, 
  initialFormData, 
  asset = ""
}: FairmintFormProps) {
  // Context hooks
  const { activeAddress, showHelpText, feeRate } = useComposer();
  
  // Form status from React hook
  useFormStatus();
  
  // Determine if we're minting with BTC or XCP based on the route
  const currencyType = asset === "BTC" ? "BTC" : asset === "XCP" ? "XCP" : "";
  const [currencyBalance, setCurrencyBalance] = useState<string>("0");
  
  // Form state
  const [formData, setFormData] = useState<FairmintFormDataInternal>(() => {
    // Don't use BTC or XCP as the initial asset
    const initialAssetValue = initialFormData?.asset || asset;
    const isSpecialAsset = initialAssetValue === "BTC" || initialAssetValue === "XCP";
    
    return {
      asset: isSpecialAsset ? "" : initialAssetValue,
      // Restored from the composed quantity on the way back from review; the lot size is not
      // known until the fairminter loads, so the effect below converts it.
      lots: "",
    };
  });
  const [restoredQuantity] = useState(() =>
    initialFormData?.quantity ? initialFormData.quantity.toString() : ""
  );
  const [selectedFairminter, setSelectedFairminter] = useState<Fairminter | undefined>(undefined);
  
  // Local validation error state (API errors handled by composer context)
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Fetch details for the currency type (BTC or XCP) for the balance header
  const { data: currencyDetails } = useAssetDetails(
    currencyType,
    {
      onLoadStart: () => {
        if (!currencyType || !activeAddress?.address) {
          return false;
        }
        return true;
      },
      onLoadEnd: () => {}
    }
  );

  // Data fetching hooks
  const { error: assetError } = useAssetDetails(
    formData.asset || "", // Pass empty string if no asset selected
    {
      // These callbacks run in the useAssetDetails hook
      onLoadStart: () => {
        if (!formData.asset || !activeAddress?.address) {
          return false; // Return false to skip fetching
        }
        return true; // Proceed with fetching
      },
      onLoadEnd: () => {
        // Handle any post-load logic if needed
      }
    }
  );

  // Update currency balance when details are loaded
  useEffect(() => {
    if (currencyDetails) {
      setCurrencyBalance(currencyDetails.availableBalance || "0");
    }
  }, [currencyDetails]);
  
  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Asked through the shared rule rather than reading price_normalized here, so this screen and
  // its summary cannot disagree about whether a mint is free.
  const isFreeMint = selectedFairminter
    ? !isPaidFairminter(
        getFairminterPaymentModel({
          price: selectedFairminter.price ?? selectedFairminter.price_normalized,
          burnPayment: selectedFairminter.burn_payment,
        })
      )
    : false;

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Every bound core checks, expressed in lots — see getMaxFairmintLots. The hard-cap and
  // per-address bounds need the asset's supply and this address's history, which this screen does
  // not load; those are skipped rather than guessed, and compose still rejects them.
  const maxLots = useCallback(() => {
    if (!selectedFairminter || isFreeMint) return "0";
    return getMaxFairmintLots({ fairminter: selectedFairminter, balance: currencyBalance });
  }, [selectedFairminter, isFreeMint, currencyBalance]);

  // Coming back from review, the composed quantity is converted back into lots once the
  // fairminter (and so the lot size) is known.
  useEffect(() => {
    if (!restoredQuantity || !selectedFairminter?.quantity_by_price_normalized) return;
    setFormData(prev =>
      prev.lots
        ? prev
        : { ...prev, lots: divide(restoredQuantity, selectedFairminter.quantity_by_price_normalized ?? 1).toString() }
    );
  }, [restoredQuantity, selectedFairminter]);

  // Handlers
  const handleFairminterChange = useCallback((asset: string, fairminter?: Fairminter) => {
    setFormData(prev => ({ ...prev, asset }));
    setSelectedFairminter(fairminter);
    setValidationError(null); // Clear validation errors when asset changes
  }, []);


  const handleSubmit = (submittedFormData: FormData) => {
    // Clear previous validation errors
    setValidationError(null);
    
    if (!formData.asset) {
      setValidationError("Please select a fairminter asset.");
      return;
    }
    if (formData.asset === "BTC" || formData.asset === "XCP") {
      setValidationError("BTC and XCP cannot be used for fairmint operations. Please select a different asset.");
      return;
    }
    
    // There is no lot-multiple check here any more. A lot count can only compose to a multiple of
    // the lot size, so core's "quantity is not a multiple of lot_size" is unreachable from this
    // form rather than caught after the fact.
    if (!isFreeMint && !isGreaterThan(formData.lots || 0, 0)) {
      setValidationError("Enter how many lots to mint.");
      return;
    }

    if (!feeRate || feeRate <= 0) {
      setValidationError("Fee rate must be greater than zero.");
      return;
    }

    // Free mints take quantity 0 — the fairminter decides the amount.
    const quantityToSubmit = isFreeMint
      ? "0"
      : getQuantityForLots(selectedFairminter ?? {}, formData.lots);

    // Create FormData object with the calculated values
    const formDataToSubmit = new FormData();
    formDataToSubmit.append("sourceAddress", activeAddress?.address || "");
    formDataToSubmit.append("asset", formData.asset);
    formDataToSubmit.append("quantity", quantityToSubmit);
    formDataToSubmit.append("sat_per_vbyte", feeRate.toString());
    
    // Let the composer context handle the API call and errors
    startTransition(() => {
      formAction(formDataToSubmit);
    });
  };

  // Determine if submit should be disabled
  const isSubmitDisabled = !formData.asset ||
    (formData.asset === "BTC") ||
    (formData.asset === "XCP") ||
    (!isFreeMint && !isGreaterThan(formData.lots || 0, 0));

  return (
    <ComposerForm
      formAction={handleSubmit}
      header={
        <div className="space-y-4">
          {/* Show the balance header for BTC or XCP */}
          {currencyType && currencyDetails ? (
            <BalanceHeader 
              balance={{
                asset: currencyType,
                quantity_normalized: asDisplayUnits(currencyDetails.availableBalance || "0"),
                asset_info: currencyDetails.assetInfo ? {
                  asset_longname: currencyDetails.assetInfo.asset_longname,
                  description: currencyDetails.assetInfo.description || '',
                  issuer: currencyDetails.assetInfo.issuer || 'Unknown',
                  divisible: currencyDetails.assetInfo.divisible,
                  locked: currencyDetails.assetInfo.locked,
                  supply: currencyDetails.assetInfo.supply,
                } : undefined,
              }}
              className="mt-1 mb-5" 
            />
          ) : null}
          
          {/* Display asset error message if any */}
          {formData.asset && assetError && (
            <div className="text-red-500 mb-4">{assetError.message}</div>
          )}
        </div>
      }
      submitDisabled={isSubmitDisabled}
    >
          {/* Show validation errors */}
          {validationError && (
            <ErrorAlert
              message={validationError}
              onClose={() => setValidationError(null)}
            />
          )}
          
          <FairminterSelectInput
            selectedAsset={formData.asset}
            onChange={handleFairminterChange}
            label="Fairminter Asset"
            required
            showHelpText={showHelpText}
            description={currencyType === "BTC" ? "Select a free fairminter — these cost only the Bitcoin network fee" : currencyType === "XCP" ? "Select a fairminter that charges XCP" : "Select an available fairminter"}
            currencyFilter={currencyType}
          />

          {/* What this mint costs and where the payment goes, stated whether or not help text is
              on. Free mints have no amount field, so this is the only account of them. */}
          {formData.asset && selectedFairminter && (
            <FairmintSummary
              fairminter={selectedFairminter}
              quantity={getQuantityForLots(selectedFairminter, formData.lots)}
            />
          )}

          {formData.asset && isFreeMint && selectedFairminter && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Free mint.</strong> The fairminter decides the amount — up to{" "}
                {selectedFairminter.max_mint_per_tx_normalized || "the maximum allowed"}{" "}
                {formData.asset} per transaction, and less if that would pass the hard cap.
              </p>
            </div>
          )}

          {/* Lots, not tokens — the same shape as the dispense form's "Times to Dispense", and
              the reason the lot-multiple error is now unreachable. */}
          {formData.asset && !isFreeMint && selectedFairminter && (
            <>
              <AmountWithMaxInput
                asset="Lots"
                availableBalance={currencyBalance}
                value={formData.lots}
                onChange={(value) => {
                  setFormData({ ...formData, lots: value });
                  setValidationError(null);
                }}
                feeRate={feeRate}
                setError={(msg) => setValidationError(msg)}
                showHelpText={showHelpText}
                sourceAddress={activeAddress}
                maxAmount={maxLots()}
                label="Lots to Mint"
                name="lots"
                description={`Each lot is ${selectedFairminter.quantity_by_price_normalized} ${formData.asset} for ${getFairminterLotCost(selectedFairminter)} XCP.`}
                disableMaxButton={false}
                onMaxClick={() => {
                  setFormData(prev => ({ ...prev, lots: maxLots() }));
                  setValidationError(null);
                }}
                hasError={!!validationError}
                isDivisible={false}
              />

            </>
          )}

    </ComposerForm>
  );
}