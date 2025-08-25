"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAddressDispensers, fetchAssetDetailsAndBalance, type DispenseOptions } from "@/utils/blockchain/counterparty";
import { formatAmount } from "@/utils/format";
import { toBigNumber } from "@/utils/numeric";
import type { ReactElement } from "react";

interface DispenserDetails {
  asset: string;
  tx_hash: string;
  status: number;
  give_remaining: number;
  give_remaining_normalized: string;
  give_quantity: number;
  give_quantity_normalized: string;
  satoshirate: number;
  asset_info?: {
    asset_longname: string | null;
    description: string;
    issuer: string | null;
    divisible: boolean;
    locked: boolean;
  };
}

interface DispenserOption {
  dispenser: DispenserDetails;
  satoshirate: number;
  btcAmount: number;
  index: number;
}

/**
 * Props for the DispenseForm component, aligned with Composer's formAction.
 */
interface DispenseFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenseOptions | null;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for dispensing from a dispenser using React 19 Actions.
 * @param {DispenseFormProps} props - Component props
 * @returns {ReactElement} Dispense form UI
 */
export function DispenseForm({ formAction, initialFormData ,
  error: composerError,
  showHelpText,
}: DispenseFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);

  const [dispenserOptions, setDispenserOptions] = useState<DispenserOption[]>([]);
  const [isFetchingDispenser, setIsFetchingDispenser] = useState<boolean>(false);
  const [dispenserError, setDispenserError] = useState<string | null>(null);
  const [btcBalance, setBtcBalance] = useState<string>("0");
  const [dispenserAddress, setDispenserAddress] = useState<string>(initialFormData?.dispenser || "");
  const [selectedDispenserIndex, setSelectedDispenserIndex] = useState<number | null>(() => {
    const formData = initialFormData as any;
    if (formData?.selectedDispenserIndex !== undefined) {
      return Number(formData.selectedDispenserIndex);
    }
    return null;
  });
  
  // Initialize with default value of "1", but try to calculate from quantity if available
  const [numberOfDispenses, setNumberOfDispenses] = useState<string>(() => {
    if (initialFormData?.quantity) {
      // Try to extract satoshirate from form data
      const formData = initialFormData as any;
      if (formData.satoshirate && Number(formData.satoshirate) > 0) {
        return Math.floor(Number(initialFormData.quantity) / Number(formData.satoshirate)).toString();
      }
    }
    return "1";
  });
  const [btcAmount, setBtcAmount] = useState<string>("");

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Fetch dispenser details when address changes
  useEffect(() => {
    const fetchDispenserDetails = async (address: string) => {
      if (!address.trim()) {
        setDispenserOptions([]);
        setDispenserError(null);
        return;
      }
      setIsFetchingDispenser(true);
      setDispenserError(null);
      setDispenserOptions([]);
      try {
        const { dispensers } = await fetchAddressDispensers(address, { status: "open", verbose: true });
        if (!dispensers || dispensers.length === 0) {
          setDispenserError("No open dispenser found at this address.");
          return;
        }
        
        // Process dispensers and normalize values
        const processedDispensers: DispenserDetails[] = (dispensers as unknown as DispenserDetails[]).map(dispenser => {
          const isDivisible = dispenser.asset_info?.divisible ?? false;
          const divisor = isDivisible ? 1e8 : 1;
          return {
            asset: dispenser.asset,
            tx_hash: dispenser.tx_hash,
            status: dispenser.status,
            give_remaining: dispenser.give_remaining,
            give_remaining_normalized: (dispenser.give_remaining / divisor).toString(),
            give_quantity: dispenser.give_quantity,
            give_quantity_normalized: (dispenser.give_quantity / divisor).toString(),
            satoshirate: dispenser.satoshirate,
            asset_info: dispenser.asset_info,
          };
        });

        // Sort by satoshirate first, then by asset name
        processedDispensers.sort((a, b) => {
          if (a.satoshirate !== b.satoshirate) {
            return a.satoshirate - b.satoshirate;
          }
          return a.asset.localeCompare(b.asset);
        });

        // Sort dispensers by price (satoshirate) from low to high, then by asset name
        const sortedDispensers = [...processedDispensers].sort((a, b) => {
          if (a.satoshirate !== b.satoshirate) {
            return a.satoshirate - b.satoshirate;
          }
          // If same price, sort by asset name
          return a.asset.localeCompare(b.asset);
        });

        // Create dispenser options for each dispenser
        const options: DispenserOption[] = sortedDispensers.map((dispenser, index) => ({
          dispenser,
          satoshirate: dispenser.satoshirate,
          btcAmount: dispenser.satoshirate / 1e8,
          index
        }));

        setDispenserOptions(options);
        console.log("Processed Dispenser Options:", JSON.stringify(options, null, 2));
      } catch (err) {
        console.error("Error fetching dispenser details:", err);
        setDispenserError("Error fetching dispenser details.");
      } finally {
        setIsFetchingDispenser(false);
      }
    };

    fetchDispenserDetails(dispenserAddress);
  }, [dispenserAddress]);

  // Select the first dispenser by default when options change
  useEffect(() => {
    if (dispenserOptions.length > 0 && selectedDispenserIndex === null) {
      setSelectedDispenserIndex(0);
    } else if (dispenserOptions.length > 0 && selectedDispenserIndex !== null) {
      // Ensure the selected index is valid for the current options
      if (selectedDispenserIndex >= dispenserOptions.length) {
        setSelectedDispenserIndex(0);
      }
    }
  }, [dispenserOptions, selectedDispenserIndex]);

  // Fetch BTC balance
  useEffect(() => {
    const fetchBtcBalance = async () => {
      if (!activeAddress?.address) return;
      try {
        const { availableBalance } = await fetchAssetDetailsAndBalance("BTC", activeAddress.address);
        setBtcBalance(availableBalance);
        console.log("BTC Balance:", availableBalance);
      } catch (err) {
        console.error("Failed to fetch BTC balance:", err);
        setBtcBalance("0");
      }
    };
    fetchBtcBalance();
  }, [activeAddress?.address]);

  // Focus dispenser address input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='dispenserAddress']") as HTMLInputElement;
    input?.focus();
  }, []);

  // Update numberOfDispenses when dispenser options change and we have a satoshirate from initialFormData
  useEffect(() => {
    if (dispenserOptions.length > 0 && initialFormData?.quantity && selectedDispenserIndex !== null) {
      const formData = initialFormData as any;
      // If we have a satoshirate in the form data, use it to calculate the number of dispenses
      if (formData.satoshirate && Number(formData.satoshirate) > 0) {
        const calculatedDispenses = Math.floor(
          Number(initialFormData.quantity) / Number(formData.satoshirate)
        ).toString();
        if (calculatedDispenses !== numberOfDispenses) {
          setNumberOfDispenses(calculatedDispenses);
        }
      }
    }
  }, [dispenserOptions, initialFormData, selectedDispenserIndex, numberOfDispenses]);


  const calculateMaxDispenses = (satoshirate: number) => {
    if (!satoshirate) return 0;
    const balanceInSatoshis = toBigNumber(btcBalance).times(1e8);
    const adjustedBalance = balanceInSatoshis.times(0.99); // 99% to account for fees
    return Math.floor(adjustedBalance.div(satoshirate).toNumber());
  };

  // Calculate which dispensers will trigger based on BTC amount
  const getTriggeredDispensers = (btcAmountSats: number): DispenserOption[] => {
    return dispenserOptions.filter(option => {
      // A dispenser triggers if the BTC amount >= its satoshirate
      return btcAmountSats >= option.satoshirate;
    }).sort((a, b) => {
      // Sort by asset name (alphabetically) as that's the order they process
      return a.dispenser.asset.localeCompare(b.dispenser.asset);
    });
  };

  const handleMaxDispenses = () => {
    console.log("handleMaxDispenses called");
    if (selectedDispenserIndex === null || dispenserOptions.length === 0) {
      console.log("No dispenser selected or no dispensers available");
      setDispenserError("Please select a dispenser first");
      return;
    }

    try {
      const selectedOption = dispenserOptions[selectedDispenserIndex];
      console.log("Selected dispenser:", selectedDispenserIndex);
      console.log("Selected option:", JSON.stringify(selectedOption));
      
      const maxAffordableDispenses = calculateMaxDispenses(selectedOption.satoshirate);
      console.log("Max Affordable Dispenses:", maxAffordableDispenses);

      // Check if user has insufficient BTC
      if (maxAffordableDispenses === 0) {
        const requiredBTC = selectedOption.satoshirate / 1e8;
        setDispenserError(`Insufficient BTC balance. You need at least ${formatAmount({
          value: requiredBTC,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8
        })} BTC to trigger this dispenser once.`);
        return;
      }

      const dispenser = selectedOption.dispenser;
      const remainingDispenses = Math.floor(
        Number(dispenser.give_remaining_normalized) / Number(dispenser.give_quantity_normalized)
      );
      console.log(
        `Dispenser ${dispenser.asset}: give_remaining_normalized=${dispenser.give_remaining_normalized}, give_quantity_normalized=${dispenser.give_quantity_normalized}, remainingDispenses=${remainingDispenses}`
      );

      const finalMaxDispenses = Math.min(maxAffordableDispenses, remainingDispenses);

      // If finalMaxDispenses is 0 due to dispenser being empty
      if (finalMaxDispenses === 0 && remainingDispenses === 0) {
        setDispenserError("This dispenser is empty and cannot be triggered.");
        return;
      }

      console.log("Final Max Dispenses:", finalMaxDispenses);
      setNumberOfDispenses(finalMaxDispenses.toString());
      console.log("Set numberOfDispenses to:", finalMaxDispenses);
      
      // Clear any previous errors
      setDispenserError(null);
    } catch (error) {
      console.error("Error in handleMaxDispenses:", error);
      setDispenserError("Error calculating max dispenses");
    }
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {(error || dispenserError) && (
          <ErrorAlert
            message={error?.message || dispenserError || ''}
            onClose={() => {
              setError(null);
              setDispenserError(null);
            }}
          />
        )}
        <form action={formAction} className="space-y-4">
          <Field>
            <Label htmlFor="dispenserAddress" className="block text-sm font-medium text-gray-700">
              Dispenser Address <span className="text-red-500">*</span>
            </Label>
            <Input
              id="dispenserAddress"
              name="dispenserAddress"
              type="text"
              defaultValue={initialFormData?.dispenser || ""}
              className="mt-1 block w-full p-2 rounded-md border"
              required
              disabled={pending || isFetchingDispenser}
              onChange={(e) => setDispenserAddress(e.target.value)}
              onBlur={(e) => setDispenserAddress(e.target.value)}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the dispenser address to send BTC to.
            </Description>
          </Field>

          {isFetchingDispenser ? (
            <div className="text-gray-500">Fetching dispenser details...</div>
          ) : dispenserOptions.length > 0 && (
            <>
              <div className="space-y-4">
                {dispenserOptions.map((option) => (
                  <label
                    key={option.index}
                    htmlFor={`dispenser-${option.index}`}
                    className={`relative flex items-start gap-3 bg-gray-50 p-4 rounded-md border cursor-pointer ${
                      pending ? "opacity-50 cursor-not-allowed" : ""
                    } ${
                      selectedDispenserIndex === option.index 
                        ? "ring-2 ring-blue-500"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      id={`dispenser-${option.index}`}
                      name="selectedDispenserIndex"
                      value={option.index}
                      checked={selectedDispenserIndex === option.index}
                      onChange={() => setSelectedDispenserIndex(option.index)}
                      className="form-radio text-blue-600 absolute right-5 top-5"
                      disabled={pending}
                    />
                    <div className="w-full">
                      <div className="flex items-start gap-3">
                        <img
                          src={`https://app.xcp.io/img/icon/${option.dispenser.asset}`}
                          alt={option.dispenser.asset}
                          className="w-10 h-10 flex-shrink-0"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">
                            {option.dispenser.asset_info?.asset_longname ?? option.dispenser.asset}
                          </div>
                          <div className="text-sm text-gray-600">
                            {formatAmount({
                              value: option.btcAmount,
                              maximumFractionDigits: 8,
                              minimumFractionDigits: 8
                            })} BTC
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex gap-2 text-xs text-gray-600">
                          <span>
                            {formatAmount({
                              value: Number(option.dispenser.give_quantity_normalized),
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 8,
                            })} Per Dispense
                          </span>
                          <span>
                            {Math.floor(Number(option.dispenser.give_remaining_normalized) / Number(option.dispenser.give_quantity_normalized)) || 0} Remaining
                          </span>
                        </div>
                        <span className="text-xs text-green-600">Open</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Hidden input to store the satoshirate of the selected dispenser */}
              {selectedDispenserIndex !== null && dispenserOptions[selectedDispenserIndex] && (
                <input
                  type="hidden"
                  id="satoshirate-input"
                  name="satoshirate"
                  value={dispenserOptions[selectedDispenserIndex].satoshirate || 0}
                  data-testid="satoshirate-input"
                />
              )}

              {/* Always show times to dispense input */}
              <AmountWithMaxInput
                asset="Dispenses"
                availableBalance={btcBalance}
                value={numberOfDispenses}
                onChange={(value) => setNumberOfDispenses(value)}
                sat_per_vbyte={initialFormData?.sat_per_vbyte || 0.1}
                setError={setDispenserError}
                shouldShowHelpText={shouldShowHelpText}
                sourceAddress={activeAddress}
                maxAmount={calculateMaxDispenses(
                  selectedDispenserIndex !== null
                    ? dispenserOptions[selectedDispenserIndex]?.satoshirate || 0
                    : dispenserOptions[0]?.satoshirate || 0
                ).toString()}
                label="Times to Dispense"
                name="numberOfDispenses"
                description="Number of times to trigger the dispenser"
                disabled={pending}
                onMaxClick={handleMaxDispenses}
                disableMaxButton={false}
                hasError={!!dispenserError}
              />

              {/* Hidden input to convert numberOfDispenses to quantity for the API */}
              <input
                type="hidden"
                id="quantity-input"
                name="quantity"
                value={
                  selectedDispenserIndex !== null && dispenserOptions[selectedDispenserIndex]
                    ? Number(numberOfDispenses) * dispenserOptions[selectedDispenserIndex].satoshirate
                    : 0
                }
              />

              {/* Hidden input to store the number of dispenses for form state persistence */}
              <input
                type="hidden"
                id="numberOfDispenses-hidden"
                name="numberOfDispenses"
                value={numberOfDispenses}
              />

              {/* Hidden input to ensure dispenser address is included in form data */}
              <input type="hidden" id="dispenser-input" name="dispenser" value={dispenserAddress} />
            </>
          )}

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />

          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
