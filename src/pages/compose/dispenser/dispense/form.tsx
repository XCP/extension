"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
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
}

/**
 * Form for dispensing from a dispenser using React 19 Actions.
 */
export function DispenseForm({ formAction, initialFormData }: DispenseFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();

  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([]);
  const [isFetchingDispenser, setIsFetchingDispenser] = useState<boolean>(false);
  const [dispenserError, setDispenserError] = useState<string | null>(null);
  const [btcBalance, setBtcBalance] = useState<string>("0");

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
      } catch (err) {
        console.error("Error fetching dispenser details:", err);
        setDispenserError("Error fetching dispenser details.");
      } finally {
        setIsFetchingDispenser(false);
      }
    };

    fetchDispenserDetails(initialFormData?.dispenser || "");
  }, [initialFormData?.dispenser]);

  // Fetch BTC balance
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

  // Focus dispenser address input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='dispenserAddress']") as HTMLInputElement;
    input?.focus();
  }, []);

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
    const adjustedBalance = balanceInSatoshis.times(0.999);
    return Math.floor(adjustedBalance.div(satoshirate).toNumber());
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mb-4" />
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
                    }`}
                  >
                    <input
                      type="radio"
                      id={`priceLevel-${option.index}`}
                      name="selectedPriceLevelIndex"
                      value={option.index}
                      defaultdefaultChecked={
                        initialFormData?.quantity &&
                        initialFormData.quantity === option.satoshirate * (Number(initialFormData.quantity) || 1)
                      }
                      className="form-radio text-blue-600 absolute right-5 top-5"
                      disabled={pending}
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

              {priceLevels.length > 0 && (
                <AmountWithMaxInput
                  asset="Dispenses"
                  availableBalance={btcBalance}
                  value={
                    initialFormData?.quantity && initialFormData.quantity > 0
                      ? Math.round(
                          initialFormData.quantity /
                            (paymentOptions.find((o) => o.satoshirate === initialFormData.quantity)?.satoshirate || 1)
                        ).toString()
                      : "1"
                  }
                  onChange={() => {}} // No-op since formAction handles submission
                  sat_per_vbyte={initialFormData?.sat_per_vbyte || 1}
                  setError={setDispenserError}
                  shouldShowHelpText={shouldShowHelpText}
                  sourceAddress={activeAddress}
                  maxAmount={calculateMaxDispenses(paymentOptions[0]?.satoshirate || 0).toString()}
                  label="Times to Dispense"
                  name="numberOfDispenses"
                  description="Number of times to trigger the dispenser"
                  disabled={pending}
                />
              )}
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
