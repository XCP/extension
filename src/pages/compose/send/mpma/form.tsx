"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
// TODO: Create MultiAssetInput component
// import { MultiAssetInput } from "@/components/inputs/multi-asset-input";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the SendMpmaForm component, aligned with Composer's formAction.
 */
interface SendMpmaFormProps {
  formAction: (formData: FormData) => void;
  showHelpText?: boolean;
  error?: string | null;
}

/**
 * Form for sending multiple assets (MPMA) using React 19 Actions.
 */
export function MPMAForm({
  formAction,
  showHelpText,
  error: composerError,
}: SendMpmaFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);
  const [balances, setBalances] = useState<{ [key: string]: { balance: string; assetInfo: any } }>({});

  const initialAssets = [{ asset: "BTC", quantity: "" }];

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Fetch balances when assets change
  useEffect(() => {
    const fetchBalances = async () => {
      if (!activeAddress?.address) return;
      const newBalances: { [key: string]: { balance: string; assetInfo: any } } = {};
      for (const { asset } of initialAssets) {
        if (asset && !balances[asset]) {
          try {
            const { availableBalance, assetInfo } = await fetchAssetDetailsAndBalance(
              asset,
              activeAddress.address
            );
            newBalances[asset] = { balance: availableBalance, assetInfo };
          } catch (err) {
            console.error(`Failed to fetch balance for ${asset}:`, err);
          }
        }
      }
      setBalances((prev) => ({ ...prev, ...newBalances }));
    };
    fetchBalances();
  }, [activeAddress?.address]);

  const aggregatedBalance = initialAssets.reduce((acc, { asset }) => {
    const balance = balances[asset]?.balance || "0";
    acc[asset] = Number(balance);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {activeAddress && (
        <BalanceHeader
          balance={{
            asset: "Multiple Assets",
            quantity_normalized: Object.entries(aggregatedBalance)
              .map(([asset, qty]) => `${qty} ${asset}`)
              .join(", "),
            asset_info: Object.values(balances).map((b) => b.assetInfo)[0], // Use first asset info
          }}
          className="mt-1 mb-5"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form action={formAction} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="destination"
              defaultValue=""
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to send the assets to.
            </Description>
          </Field>
          {/* TODO: Add MultiAssetInput component
          <MultiAssetInput
            assets={initialAssets}
            onAssetsChange={() => {}} // No-op since formAction handles submission
            name="assets"
            balances={balances}
            shouldShowHelpText={shouldShowHelpText}
            feeRateSatPerVByte={1} // Default value; updated via FeeRateInput
            sourceAddress={activeAddress}
            setError={() => {}} // No-op since Composer handles errors
            disabled={pending}
          /> */}
          <Field>
            <Label className="text-sm font-medium text-gray-700">Memo</Label>
            <Input
              type="text"
              name="memo"
              defaultValue=""
              placeholder="Optional memo"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional memo to include with the transaction.
            </Description>
          </Field>

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export { MPMAForm as SendMpmaForm };
