import React, { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAddressDispensers, fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";
import { formatAmount } from "@/utils/format";
import { toBigNumber } from "@/utils/numeric";

export interface DispenseFormData {
  dispenserAddress: string;

  numberOfDispenses: string;
  selectedPriceLevelIndex: number;
}

interface DispenserDetails {
  asset: string;
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
  assets: {
    asset: string;
    quantity: string;
    asset_info?: DispenserDetails["asset_info"];
  }[];
  index: number;
}

interface DispenseFormProps {
  onSubmit: (data: any) => void;
}

export function DispenseForm({ onSubmit }: DispenseFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const dispenserAddressRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<DispenseFormData>({
    dispenserAddress: "",

    numberOfDispenses: "1",
    selectedPriceLevelIndex: -1,
  });

  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([]);
  const [isFetchingDispenser, setIsFetchingDispenser] = useState<boolean>(false);
  const [dispenserError, setDispenserError] = useState<string | null>(null);
  const [btcBalance, setBtcBalance] = useState<string>("0");

  useEffect(() => {
    dispenserAddressRef.current?.focus();
  }, []);

  useEffect(() => {
    if (formData.dispenserAddress.trim()) {
      fetchDispenserDetails(formData.dispenserAddress.trim());
    } else {
      setPriceLevels([]);
      setDispenserError(null);
      setFormData((prev) => ({
        ...prev,
        selectedPriceLevelIndex: -1,
        numberOfDispenses: "1",
      }));
    }
  }, [formData.dispenserAddress]);

  const fetchDispenserDetails = async (address: string) => {
    setIsFetchingDispenser(true);
    setDispenserError(null);
    setPriceLevels([]);
    try {
      const { dispensers } = await fetchAddressDispensers(address, {
        status: "open",
        verbose: true,
      });
      if (!dispensers || dispensers.length === 0) {
        setDispenserError("No open dispenser found at this address.");
        return;
      }
      const priceLevelMap = new Map<number, DispenserDetails[]>();
      for (const dispenser of dispensers) {
        const rate = dispenser.satoshirate;
        if (!priceLevelMap.has(rate)) {
          priceLevelMap.set(rate, []);
        }
        const isDivisible = dispenser.asset_info?.divisible ?? false;
        const divisor = isDivisible ? 1e8 : 1;
        priceLevelMap.get(rate)!.push({
          asset: dispenser.asset,
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
        .map(([satoshirate, dispensers]) => ({
          satoshirate,
          dispensers,
        }))
        .sort((a, b) => a.satoshirate - b.satoshirate);
      setPriceLevels(priceLevelsArray);
    } catch (err) {
      console.error("Error fetching dispenser details:", err);
      setDispenserError("Error fetching dispenser details.");
    } finally {
      setIsFetchingDispenser(false);
    }
  };

  useEffect(() => {
    const fetchBtcBalance = async () => {
      if (!activeAddress?.address) return;
      try {
        const { availableBalance } = await fetchAssetDetailsAndBalance("BTC", activeAddress.address);
        setBtcBalance(availableBalance);
      } catch (err) {
        console.error("Failed to fetch BTC balance:", err);
        setBtcBalance("0");
      }
    };
    fetchBtcBalance();
  }, [activeAddress?.address]);

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

  const selectedPriceOption =
    formData.selectedPriceLevelIndex !== -1
      ? paymentOptions[formData.selectedPriceLevelIndex]
      : null;
  const numberOfDispenses = Number(formData.numberOfDispenses) || 0;
  const totalQuantity = selectedPriceOption ? selectedPriceOption.satoshirate * numberOfDispenses : 0;
  const totalBtcAmount = selectedPriceOption ? selectedPriceOption.btcAmount * numberOfDispenses : 0;
  const totalAssets = selectedPriceOption
    ? selectedPriceOption.assets.map((asset) => ({
        asset: asset.asset,
        quantity: (Number(asset.quantity) * numberOfDispenses).toString(),
        asset_info: asset.asset_info,
      }))
    : [];

  const calculateMaxDispenses = useCallback(
    (priceLevel: PriceLevel) => {
      if (!priceLevel) return 0;
      const balanceInSatoshis = toBigNumber(btcBalance).times(1e8);
      const satoshirate = priceLevel.satoshirate;
      const adjustedBalance = balanceInSatoshis.times(0.999);
      return Math.floor(adjustedBalance.div(satoshirate).toNumber());
    },
    [btcBalance]
  );

  const maxDispenses =
    formData.selectedPriceLevelIndex !== -1
      ? calculateMaxDispenses(priceLevels[formData.selectedPriceLevelIndex])
      : 0;
  const showMultipleDispenses = maxDispenses > 1;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !formData.dispenserAddress.trim() ||
      formData.selectedPriceLevelIndex === -1 ||
      Number(formData.numberOfDispenses) <= 0
    ) {
      return;
    }
    const submissionData = {
      dispenser: formData.dispenserAddress.trim(),
      quantity: totalQuantity.toString(),
      
      extra: {
        priceLevels,
        selectedPriceLevelIndex: formData.selectedPriceLevelIndex,
        numberOfDispenses: formData.numberOfDispenses,
        paymentOptions,
        totalBtcAmount,
        totalAssets,
      },
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name}
          className="mb-4"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label htmlFor="dispenserAddress" className="block text-sm font-medium text-gray-700">
              Dispenser Address<span className="text-red-500">*</span>
            </Label>
            <Input
              id="dispenserAddress"
              name="dispenserAddress"
              type="text"
              value={formData.dispenserAddress}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  dispenserAddress: e.target.value,
                  selectedPriceLevelIndex: -1,
                  numberOfDispenses: "1",
                }))
              }
              ref={dispenserAddressRef}
              className="mt-1 block w-full p-2 rounded-md border"
              required
            />
            {settings?.showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Enter the dispenser address to send BTC to.
              </Description>
            )}
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
                      formData.selectedPriceLevelIndex === option.index
                        ? "border-blue-500"
                        : "border-gray-300"
                    }`}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, selectedPriceLevelIndex: option.index }))
                    }
                  >
                    <input
                      type="radio"
                      id={`priceLevel-${option.index}`}
                      name="selectedPriceLevel"
                      value={option.index}
                      checked={formData.selectedPriceLevelIndex === option.index}
                      onChange={() =>
                        setFormData((prev) => ({
                          ...prev,
                          selectedPriceLevelIndex: option.index,
                        }))
                      }
                      className="form-radio text-blue-600 absolute right-5 top-5"
                    />
                    <div className="text-sm space-y-2">
                      <div>
                        <strong>Pay Per Dispense:</strong> {option.btcAmount.toFixed(8)} BTC
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

              {showMultipleDispenses && formData.selectedPriceLevelIndex !== -1 && (
                <AmountWithMaxInput
                  asset="Dispenses"
                  label="Times to Dispense"
                  name="numberOfDispenses"
                  value={formData.numberOfDispenses}
                  onChange={(value: string) => {
                    const numValue = value.replace(/\D/g, "");
                    setFormData((prev) => ({ ...prev, numberOfDispenses: numValue || "1" }));
                  }}
                  maxAmount={maxDispenses.toString()}
                  availableBalance={btcBalance}
                  feeRateSatPerVByte={formData.feeRateSatPerVByte}
                  description="Number of times to trigger the dispenser"
                  setError={() => {}}
                  shouldShowHelpText={settings?.showHelpText}
                  sourceAddress={{ address: activeAddress?.address || '' }}
                />
              )}

              {numberOfDispenses > 0 && selectedPriceOption && (
                <div className="bg-blue-50 p-4 rounded-md space-y-2">
                  <div className="text-sm text-blue-700">
                    <strong>Total Pay:</strong>{" "}
                    {formatAmount({
                      value: totalBtcAmount,
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })}{" "}
                    BTC
                  </div>
                  <div className="text-sm text-blue-700">
                    <strong>Total Get:</strong>
                    <ul className="list-disc list-inside">
                      {totalAssets.map((asset, idx) => (
                        <li key={idx}>
                          {formatAmount({
                            value: Number(asset.quantity),
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 8,
                          })}{" "}
                          {asset.asset_info?.asset_longname ?? asset.asset}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}

          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))
            }
            error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={settings?.showHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={
              !formData.dispenserAddress.trim() ||
              formData.selectedPriceLevelIndex === -1 ||
              formData.feeRateSatPerVByte <= 0 ||
              priceLevels.length === 0 ||
              !!dispenserError ||
              !formData.numberOfDispenses ||
              Number(formData.numberOfDispenses) <= 0
            }
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
