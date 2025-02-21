import React, { useState, FormEvent } from "react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

const ADDRESS_OPTION_REQUIRE_MEMO = 1;

export interface AddressOptionsFormData {
  requireMemo: boolean;
  feeRateSatPerVByte: number;
}

interface AddressOptionsFormProps {
  onSubmit: (data: AddressOptionsFormData & { text?: string }) => void;
}

export function AddressOptionsForm({ onSubmit }: AddressOptionsFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const [formData, setFormData] = useState<Omit<AddressOptionsFormData, 'feeRateSatPerVByte'>>({
    requireMemo: false,
  });
  const [feeRate, setFeeRate] = useState<number>(0);

  const handleRequireMemoChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, requireMemo: checked }));
  };

  const handleSubmitInternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (feeRate <= 0) return;
    const options = formData.requireMemo ? ADDRESS_OPTION_REQUIRE_MEMO : 0;
    onSubmit({
      ...formData,
      feeRateSatPerVByte: feeRate,
      text: `options ${options}`,
    });
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
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmitInternal} className="space-y-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm text-yellow-700">
              The "Require Memo" option will make this address reject transactions without memos.
              This setting cannot be reversed.
            </p>
          </div>
          <CheckboxInput
            checked={formData.requireMemo}
            onChange={handleRequireMemoChange}
            label="Require Memo for Incoming Transactions"
            aria-label="Toggle require memo for incoming transactions"
          />
          <FeeRateInput
            onChange={setFeeRate}
            error={feeRate <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={settings?.showHelpText}
          />
          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.requireMemo || feeRate <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
