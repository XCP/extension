import React, { useState, FormEvent } from "react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { BroadcastOptions } from "@/utils/blockchain/counterparty";

const ADDRESS_OPTION_REQUIRE_MEMO = 1;

interface AddressOptionsFormDataInternal {
  requireMemo: boolean;
  sat_per_vbyte: number;
}

interface AddressOptionsFormProps {
  onSubmit: (data: BroadcastOptions) => void;
  initialFormData?: BroadcastOptions;
}

export function AddressOptionsForm({ onSubmit, initialFormData }: AddressOptionsFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<AddressOptionsFormDataInternal>(() => ({
    requireMemo: initialFormData?.text === `options ${ADDRESS_OPTION_REQUIRE_MEMO}` || false,
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.requireMemo) {
      setLocalError("Please check 'Require Memo' to proceed.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const options = formData.requireMemo ? ADDRESS_OPTION_REQUIRE_MEMO : 0;
    const submissionData: BroadcastOptions = {
      sourceAddress: activeAddress?.address || "",
      text: `options ${options}`,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ""}
          className="mb-6"
        />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm text-yellow-700">
              The "Require Memo" option will make this address reject transactions without memos. This setting cannot be reversed.
            </p>
          </div>
          <CheckboxInput
            checked={formData.requireMemo}
            onChange={(checked) => setFormData({ ...formData, requireMemo: checked })}
            label="Require Memo for Incoming Transactions"
            aria-label="Toggle require memo for incoming transactions"
          />
          <FeeRateInput
            id="sat_per_vbyte"
            value={formData.sat_per_vbyte}
            onChange={(value) => setFormData({ ...formData, sat_per_vbyte: value })}
            error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={shouldShowHelpText}
          />
          <Button type="submit" color="blue" fullWidth>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
