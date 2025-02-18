import React, { useState, FormEvent } from "react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

const ADDRESS_OPTION_REQUIRE_MEMO = 1;

export interface AddressOptionsFormData {
  requireMemo: boolean;
  feeRateSatPerVByte: number;
}

const DEFAULT_FORM_DATA: AddressOptionsFormData = {
  requireMemo: false,
  feeRateSatPerVByte: 1,
};

interface AddressOptionsFormProps {
  onSubmit: (data: AddressOptionsFormData & { text?: string }) => void;
}

export function AddressOptionsForm({
  onSubmit,
}: AddressOptionsFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const [formData, setFormData] = useState<AddressOptionsFormData>(DEFAULT_FORM_DATA);

  const handleRequireMemoChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, requireMemo: checked }));
  };

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  const handleSubmitInternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const options = formData.requireMemo ? ADDRESS_OPTION_REQUIRE_MEMO : 0;
    onSubmit({
      ...formData,
      text: `options ${options}`,
    });
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name}
          className="mb-6"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form onSubmit={handleSubmitInternal} className="space-y-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm text-yellow-700">
              The "Require Memo" option will make this address reject transactions
              without memos. This setting cannot be reversed.
            </p>
          </div>

          <CheckboxInput
            checked={formData.requireMemo}
            onChange={handleRequireMemoChange}
            label="Require Memo for Incoming Transactions"
            aria-label="Toggle require memo for incoming transactions"
          />

          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={handleFeeRateChange}
            showHelpText={settings?.showHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={!formData.requireMemo || formData.feeRateSatPerVByte <= 0}
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
