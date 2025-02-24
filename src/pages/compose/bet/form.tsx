import React, { useState, useRef, useEffect, Suspense } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { isValidBase58Address } from "@/utils/blockchain/bitcoin";
import type { BetOptions } from "@/utils/blockchain/counterparty";

/**
 * Internal form data structure for the BetForm component.
 * @typedef {Object} BetFormDataInternal
 * @property {string} feed_address - The address of the feed to bet on.
 * @property {string} bet_type - The type of bet (0: Bullish, 1: Bearish, 2: Equal, 3: NotEqual).
 * @property {string} deadline - The block deadline for the bet.
 * @property {string} wager_quantity - The wager amount in XCP (human-readable).
 * @property {string} counterwager_quantity - The counterwager amount in XCP (human-readable).
 * @property {string} expiration - The number of blocks until expiration.
 * @property {string} leverage - The leverage factor for the bet.
 * @property {string} target_value - The target value for Equal/NotEqual bets.
 * @property {number} sat_per_vbyte - The fee rate in satoshis per virtual byte.
 */
interface BetFormDataInternal {
  feed_address: string;
  bet_type: string;
  deadline: string;
  wager_quantity: string;
  counterwager_quantity: string;
  expiration: string;
  leverage: string;
  target_value: string;
  sat_per_vbyte: number;
}

/**
 * Props for the BetForm component.
 * @typedef {Object} BetFormProps
 * @property {(data: BetOptions) => void} onSubmit - Callback to submit the validated bet data to the Composer.
 * @property {BetOptions} [initialFormData] - Optional initial data to prefill the form.
 */
interface BetFormProps {
  onSubmit: (data: BetOptions) => void;
  initialFormData?: BetOptions;
}

/**
 * A form component for composing a bet transaction on the Counterparty protocol.
 * Validates user input and submits bet options to the Composer for processing.
 * Manages loading state for fetching XCP balance details.
 * @param {BetFormProps} props - The properties for the BetForm component.
 * @returns {ReactElement} The rendered bet form UI.
 * @example
 * ```tsx
 * <BetForm onSubmit={handleBetSubmit} initialFormData={initialBetData} />
 * ```
 */
export function BetForm({ onSubmit, initialFormData }: BetFormProps): ReactElement {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const { showLoading, hideLoading } = useLoading();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails("XCP");

  const [formData, setFormData] = useState<BetFormDataInternal>(() => {
    const isDivisible = assetDetails?.assetInfo?.divisible ?? true; // XCP is divisible
    const wagerQty = initialFormData?.wager_quantity || 0;
    const counterwagerQty = initialFormData?.counterwager_quantity || 0;
    return {
      feed_address: initialFormData?.feed_address || "",
      bet_type: initialFormData?.bet_type?.toString() || "2",
      deadline: initialFormData?.deadline?.toString() || "",
      wager_quantity: initialFormData
        ? isDivisible
          ? (wagerQty / 1e8).toFixed(8)
          : wagerQty.toString()
        : "",
      counterwager_quantity: initialFormData
        ? isDivisible
          ? (counterwagerQty / 1e8).toFixed(8)
          : counterwagerQty.toString()
        : "",
      expiration: initialFormData?.expiration?.toString() || "",
      leverage: initialFormData?.leverage?.toString() || "5040",
      target_value: initialFormData?.target_value?.toString() || "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
    };
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Focuses the feed address input on mount.
   */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Manages loading state for fetching XCP asset details and updates form data if initial data changes.
   */
  useEffect(() => {
    let loadingId: string | undefined;

    if (!assetDetails && !assetError) {
      loadingId = showLoading("Loading XCP details...", {
        onError: (err) => setLocalError(`Failed to load XCP details: ${err.message}`),
      });
    } else if (loadingId) {
      hideLoading(loadingId);
    }

    if (initialFormData && assetDetails) {
      const isDivisible = assetDetails.assetInfo?.divisible ?? true;
      const wagerQty = initialFormData.wager_quantity;
      const counterwagerQty = initialFormData.counterwager_quantity;
      setFormData((prev) => ({
        ...prev,
        wager_quantity: isDivisible ? (wagerQty / 1e8).toFixed(8) : wagerQty.toString(),
        counterwager_quantity: isDivisible
          ? (counterwagerQty / 1e8).toFixed(8)
          : counterwagerQty.toString(),
      }));
    }

    return () => {
      if (loadingId) hideLoading(loadingId);
    };
  }, [assetDetails, assetError, initialFormData, showLoading, hideLoading]);

  /**
   * Handles form submission by validating inputs and preparing bet options for the Composer.
   * @param {React.FormEvent<HTMLFormElement>} e - The form submission event.
   */
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.feed_address || !isValidBase58Address(formData.feed_address)) {
      setLocalError("Please enter a valid feed address.");
      return;
    }
    if (!["0", "1", "2", "3"].includes(formData.bet_type)) {
      setLocalError("Please select a valid bet type.");
      return;
    }
    if (!formData.deadline || Number(formData.deadline) <= 0) {
      setLocalError("Please enter a valid deadline.");
      return;
    }
    if (!formData.wager_quantity || Number(formData.wager_quantity) <= 0) {
      setLocalError("Please enter a valid wager quantity greater than zero.");
      return;
    }
    if (!formData.counterwager_quantity || Number(formData.counterwager_quantity) <= 0) {
      setLocalError("Please enter a valid counterwager quantity greater than zero.");
      return;
    }
    if (!formData.expiration || Number(formData.expiration) <= 0) {
      setLocalError("Please enter a valid expiration block count.");
      return;
    }
    if (!formData.leverage || Number(formData.leverage) <= 0) {
      setLocalError("Please enter a valid leverage value greater than zero.");
      return;
    }
    if (
      (formData.bet_type === "2" || formData.bet_type === "3") &&
      (!formData.target_value || Number(formData.target_value) <= 0)
    ) {
      setLocalError("Please enter a valid target value for Equal/NotEqual bet.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    const wagerQtyNum = Number(formData.wager_quantity);
    const counterwagerQtyNum = Number(formData.counterwager_quantity);
    const wagerQtyInt = isDivisible ? Math.round(wagerQtyNum * 1e8) : Math.round(wagerQtyNum);
    const counterwagerQtyInt = isDivisible
      ? Math.round(counterwagerQtyNum * 1e8)
      : Math.round(counterwagerQtyNum);

    const submissionData: BetOptions = {
      sourceAddress: activeAddress?.address || "",
      feed_address: formData.feed_address,
      bet_type: Number(formData.bet_type),
      deadline: Number(formData.deadline),
      wager_quantity: wagerQtyInt,
      counterwager_quantity: counterwagerQtyInt,
      expiration: Number(formData.expiration),
      leverage: Number(formData.leverage),
      target_value: Number(formData.target_value || "0"),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        {assetError ? (
          <div className="text-red-500 mb-4">{assetError.message}</div>
        ) : assetDetails ? (
          <BalanceHeader
            balance={{
              asset: "XCP",
              quantity_normalized: assetDetails.availableBalance,
              asset_info: assetDetails.assetInfo || undefined,
            }}
            className="mb-5"
          />
        ) : null}
      </Suspense>
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Feed Address <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={inputRef}
              type="text"
              name="feed_address"
              value={formData.feed_address}
              onChange={(e) => setFormData({ ...formData, feed_address: e.target.value.trim() })}
              required
              placeholder="Enter feed address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address of the feed you want to bet on.
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Bet Type <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="bet_type"
              value={formData.bet_type}
              onChange={(e) => setFormData({ ...formData, bet_type: e.target.value.trim() })}
              required
              placeholder="e.g., 2"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter bet type (0 = Bullish, 1 = Bearish, 2 = Equal, 3 = Not Equal).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Deadline <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="deadline"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value.trim() })}
              required
              placeholder="Enter deadline block"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the block deadline for the bet.
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Wager Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="wager_quantity"
              value={formData.wager_quantity}
              onChange={(e) => setFormData({ ...formData, wager_quantity: e.target.value.trim() })}
              required
              placeholder="Enter wager quantity"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the XCP wager amount (up to 8 decimal places).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Counterwager Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="counterwager_quantity"
              value={formData.counterwager_quantity}
              onChange={(e) =>
                setFormData({ ...formData, counterwager_quantity: e.target.value.trim() })
              }
              required
              placeholder="Enter counterwager quantity"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the XCP counterwager amount (up to 8 decimal places).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Expiration <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="expiration"
              value={formData.expiration}
              onChange={(e) => setFormData({ ...formData, expiration: e.target.value.trim() })}
              required
              placeholder="Enter expiration blocks"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the number of blocks until the bet expires.
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Leverage <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="leverage"
              value={formData.leverage}
              onChange={(e) => setFormData({ ...formData, leverage: e.target.value.trim() })}
              required
              placeholder="e.g., 5040"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the leverage factor (default is 5040).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Target Value{" "}
              {(formData.bet_type === "2" || formData.bet_type === "3") && (
                <span className="text-red-500">*</span>
              )}
            </Label>
            <Input
              type="text"
              name="target_value"
              value={formData.target_value}
              onChange={(e) => setFormData({ ...formData, target_value: e.target.value.trim() })}
              required={formData.bet_type === "2" || formData.bet_type === "3"}
              placeholder="Enter target value"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the target value for Equal/NotEqual bets (required for types 2 and 3).
            </Description>
          </Field>

          <FeeRateInput
            id="sat_per_vbyte"
            value={formData.sat_per_vbyte}
            onChange={(value) => setFormData({ ...formData, sat_per_vbyte: value })}
            error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
            showLabel
            label="Fee Rate (sat/vB)"
            showHelpText={shouldShowHelpText}
            autoFetch
          />

          <Button type="submit" color="blue" fullWidth>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
