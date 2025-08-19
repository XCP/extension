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

interface PriceLevel {
  satoshirate: number;
  dispensers: DispenserDetails[];
}

interface PaymentOption {
  satoshirate: number;
  btcAmount: number;
  assets: { asset: string; quantity: string; asset_info?: DispenserDetails["asset_info"] }[];
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

  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([]);
  const [isFetchingDispenser, setIsFetchingDispenser] = useState<boolean>(false);
  const [dispenserError, setDispenserError] = useState<string | null>(null);
  const [btcBalance, setBtcBalance] = useState<string>("0");
  const [dispenserAddress, setDispenserAddress] = useState<string>(initialFormData?.dispenser || "");
  const [selectedPriceLevelIndex, setSelectedPriceLevelIndex] = useState<number | null>(() => {
    const formData = initialFormData as any;
    if (formData?.selectedPriceLevelIndex !== undefined) {
      return Number(formData.selectedPriceLevelIndex);
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
        setPriceLevels([]);
        setDispenserError(null);
        return;
      }
      setIsFetchingDispenser(true);
      setDispenserError(null);
      setPriceLevels([]);
      try {
        const { dispensers } = await fetchAddressDispensers(address, { status: "open", verbose: true });
        if (!dispensers || dispensers.length === 0) {
          setDispenserError("No open dispenser found at this address.");
          return;
        }
        const priceLevelMap = new Map<number, DispenserDetails[]>();
        for (const dispenser of dispensers as unknown as DispenserDetails[]) {
          const rate = dispenser.satoshirate;
          if (!priceLevelMap.has(rate)) priceLevelMap.set(rate, []);
          const isDivisible = dispenser.asset_info?.divisible ?? false;
          const divisor = isDivisible ? 1e8 : 1;
          priceLevelMap.get(rate)!.push({
            asset: dispenser.asset,
            tx_hash: dispenser.tx_hash,
            status: dispenser.status,
            give_remaining: dispenser.give_remaining,
            give_remaining_normalized: (dispenser.give_remaining / divisor).toString(),
            give_quantity: dispenser.give_quantity,
            give_quantity_normalized: (dispenser.give_quantity / divisor).toString(),
            satoshirate: dispenser.satoshirate,
            asset_info: dispenser.asset_info,
          });
        }
        const priceLevelsArray: PriceLevel[] = Array.from(priceLevelMap.entries())
          .map(([satoshirate, dispensers]) => ({ satoshirate, dispensers }))
          .sort((a, b) => a.satoshirate - b.satoshirate);
        setPriceLevels(priceLevelsArray);
        console.log("Fetched Price Levels:", JSON.stringify(priceLevelsArray, null, 2));
      } catch (err) {
        console.error("Error fetching dispenser details:", err);
        setDispenserError("Error fetching dispenser details.");
      } finally {
        setIsFetchingDispenser(false);
      }
    };

    fetchDispenserDetails(dispenserAddress);
  }, [dispenserAddress]);

  // Select the first price level by default when price levels change
  useEffect(() => {
    if (priceLevels.length > 0 && selectedPriceLevelIndex === null) {
      setSelectedPriceLevelIndex(0);
    } else if (priceLevels.length > 0 && selectedPriceLevelIndex !== null) {
      // Ensure the selected index is valid for the current price levels
      if (selectedPriceLevelIndex >= priceLevels.length) {
        setSelectedPriceLevelIndex(0);
      }
    }
  }, [priceLevels, selectedPriceLevelIndex]);

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

  // Update numberOfDispenses when price levels change and we have a satoshirate from initialFormData
  useEffect(() => {
    if (priceLevels.length > 0 && initialFormData?.quantity && selectedPriceLevelIndex !== null) {
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
  }, [priceLevels, initialFormData, selectedPriceLevelIndex, numberOfDispenses]);

  const paymentOptions: PaymentOption[] = priceLevels.map((priceLevel, index) => {
    let assets: { asset: string; quantity: string; asset_info?: DispenserDetails["asset_info"] }[] = [];
    for (let i = 0; i <= index; i++) {
      const levelDisps = priceLevels[i].dispensers;
      levelDisps.forEach((dispenser) => {
        const existing = assets.find((a) => a.asset === dispenser.asset);
        if (existing) {
          existing.quantity = (Number(existing.quantity) + Number(dispenser.give_quantity_normalized)).toString();
        } else {
          assets.push({
            asset: dispenser.asset,
            quantity: dispenser.give_quantity_normalized,
            asset_info: dispenser.asset_info,
          });
        }
      });
    }
    return {
      satoshirate: priceLevel.satoshirate,
      btcAmount: priceLevel.satoshirate / 1e8,
      assets,
      index,
    };
  });

  const calculateMaxDispenses = (satoshirate: number) => {
    if (!satoshirate) return 0;
    const balanceInSatoshis = toBigNumber(btcBalance).times(1e8);
    const adjustedBalance = balanceInSatoshis.times(0.99); // 99% to account for fees
    return Math.floor(adjustedBalance.div(satoshirate).toNumber());
  };

  const handleMaxDispenses = () => {
    console.log("handleMaxDispenses called");
    if (selectedPriceLevelIndex === null || priceLevels.length === 0) {
      console.log("No price level selected or no price levels available");
      setDispenserError("Please select a price level first");
      return;
    }

    try {
      const selectedOption = paymentOptions[selectedPriceLevelIndex];
      console.log("Selected price level:", selectedPriceLevelIndex);
      console.log("Selected option:", JSON.stringify(selectedOption));
      
      const maxAffordableDispenses = calculateMaxDispenses(selectedOption.satoshirate);
      console.log("Max Affordable Dispenses:", maxAffordableDispenses);

      const selectedDispensers = priceLevels[selectedPriceLevelIndex].dispensers;
      let minRemainingDispenses = Number.MAX_SAFE_INTEGER;

      for (const dispenser of selectedDispensers) {
        const remainingDispenses = Math.floor(
          Number(dispenser.give_remaining_normalized) / Number(dispenser.give_quantity_normalized)
        );
        console.log(
          `Dispenser ${dispenser.asset}: give_remaining_normalized=${dispenser.give_remaining_normalized}, give_quantity_normalized=${dispenser.give_quantity_normalized}, remainingDispenses=${remainingDispenses}`
        );
        if (remainingDispenses < minRemainingDispenses) {
          minRemainingDispenses = remainingDispenses;
        }
      }

      console.log("Min Remaining Dispenses:", minRemainingDispenses);

      const finalMaxDispenses = Math.min(
        maxAffordableDispenses,
        minRemainingDispenses === Number.MAX_SAFE_INTEGER ? maxAffordableDispenses : minRemainingDispenses
      );

      console.log("Final Max Dispenses:", finalMaxDispenses);
      setNumberOfDispenses(finalMaxDispenses.toString());
      console.log("Set numberOfDispenses to:", finalMaxDispenses);
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
      {dispenserError && <div className="text-red-500 mb-2">{dispenserError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
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
          ) : dispenserError ? (
            <div className="text-red-500">{dispenserError}</div>
          ) : priceLevels.length > 0 && (
            <>
              <div className="space-y-4">
                {paymentOptions.map((option) => (
                  <label
                    key={option.index}
                    htmlFor={`priceLevel-${option.index}`}
                    className={`relative flex items-start gap-3 bg-gray-50 p-4 rounded-md border cursor-pointer ${
                      pending ? "opacity-50 cursor-not-allowed" : ""
                    } ${selectedPriceLevelIndex === option.index ? "ring-2 ring-blue-500" : ""}`}
                  >
                    <input
                      type="radio"
                      id={`priceLevel-${option.index}`}
                      name="selectedPriceLevelIndex"
                      value={option.index}
                      checked={selectedPriceLevelIndex === option.index}
                      onChange={() => setSelectedPriceLevelIndex(option.index)}
                      className="form-radio text-blue-600 absolute right-5 top-5"
                      disabled={pending}
                    />
                    <div className="text-sm space-y-2">
                      <div className="text-sm text-gray-600">
                        <strong>Pay Per Dispense:</strong> {formatAmount({
                          value: option.btcAmount,
                          maximumFractionDigits: 8,
                          minimumFractionDigits: 8
                        })} BTC
                      </div>
                      <div>
                        <strong>Get Per Dispense:</strong>
                        <ul className="mt-1">
                          {priceLevels[option.index].dispensers.map((dispenser, i) => (
                            <li key={i}>
                              {formatAmount({
                                value: Number(dispenser.give_quantity_normalized),
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 8,
                              })}{" "}
                              {dispenser.asset_info?.asset_longname ?? dispenser.asset}
                            </li>
                          ))}
                          {option.index > 0 && (
                            <li className="italic text-gray-500">and everything from previous levels</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Hidden input to store the satoshirate of the selected price level */}
              {selectedPriceLevelIndex !== null && (
                <input
                  type="hidden"
                  id="satoshirate-input"
                  name="satoshirate"
                  value={paymentOptions[selectedPriceLevelIndex]?.satoshirate || 0}
                  data-testid="satoshirate-input"
                />
              )}

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
                  selectedPriceLevelIndex !== null
                    ? paymentOptions[selectedPriceLevelIndex]?.satoshirate || 0
                    : paymentOptions[0]?.satoshirate || 0
                ).toString()}
                label="Times to Dispense"
                name="numberOfDispenses"
                description="Number of times to trigger the dispenser"
                disabled={pending}
                onMaxClick={handleMaxDispenses}
                disableMaxButton={false}
              />

              {/* Hidden input to convert numberOfDispenses to quantity for the API */}
              <input
                type="hidden"
                id="quantity-input"
                name="quantity"
                value={
                  selectedPriceLevelIndex !== null
                    ? Number(numberOfDispenses) * paymentOptions[selectedPriceLevelIndex].satoshirate
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
