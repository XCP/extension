import React, { useState, FormEvent } from "react";
import { Field, Label, Description, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { FiChevronDown, FiCheck } from "react-icons/fi";
import { Button } from "@/components/button";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { DispenserOptions } from "@/utils/blockchain/counterparty";

interface Dispenser {
  tx_hash: string;
  asset: string;
}

interface DispenserCloseFormDataInternal {
  asset: string;
  tx_hash?: string;
  sat_per_vbyte: number;
}

interface DispenserCloseFormProps {
  onSubmit: (data: DispenserOptions) => void;
  initialFormData?: DispenserOptions;
  dispensers: Dispenser[];
  totalDispensers: number;
  asset: string;
}

export function DispenserCloseForm({
  onSubmit,
  initialFormData,
  dispensers,
  totalDispensers,
  asset,
}: DispenserCloseFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<DispenserCloseFormDataInternal>(() => ({
    asset: initialFormData?.asset || asset || "",
    tx_hash: initialFormData?.open_address || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const shouldUseAssetSelect = !asset && (dispensers.length === 0 || totalDispensers > 100);
  const relevantDispensers = asset ? dispensers.filter((d) => d.asset === asset) : dispensers;

  const AssetIcon = ({ asset }: { asset: string }) => (
    <img
      src={`https://app.xcp.io/img/icon/${asset}`}
      alt={`${asset} icon`}
      className="w-5 h-5 rounded-full"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.asset) {
      setLocalError("Asset is required.");
      return;
    }
    if (!shouldUseAssetSelect && !formData.tx_hash) {
      setLocalError("Dispenser transaction hash is required.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: DispenserOptions = {
      sourceAddress: activeAddress?.address || "",
      asset: formData.asset,
      give_quantity: 0, // Close action typically sets these to 0
      escrow_quantity: 0,
      mainchainrate: 0,
      status: "10", // Status 10 is typically used to close a dispenser
      open_address: formData.tx_hash || undefined,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {shouldUseAssetSelect ? (
          <AssetSelectInput
            selectedAsset={formData.asset}
            onChange={(value) => setFormData((prev) => ({ ...prev, asset: value }))}
            label="Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="Select the asset you want to close the dispenser for"
          />
        ) : (
          <Field>
            <Label className="block text-sm font-medium text-gray-700">
              Dispenser <span className="text-red-500">*</span>
            </Label>
            <Listbox
              value={formData.tx_hash || ""}
              onChange={(value) => {
                const selectedDispenser = relevantDispensers.find((d) => d.tx_hash === value);
                setFormData((prev) => ({
                  ...prev,
                  tx_hash: value,
                  asset: selectedDispenser?.asset || prev.asset,
                }));
              }}
            >
              <div className="relative mt-1">
                <ListboxButton className="relative w-full cursor-default rounded-lg bg-gray-50 py-2 pl-3 pr-10 text-left border focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm">
                  <div className="flex items-center">
                    {formData.asset && <AssetIcon asset={formData.asset} />}
                    <span className={`block truncate ${formData.asset ? "ml-2" : ""}`}>
                      {formData.asset || "Select an asset"}
                    </span>
                  </div>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <FiChevronDown className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </span>
                </ListboxButton>
                <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {relevantDispensers.map((dispenser) => (
                    <ListboxOption
                      key={dispenser.tx_hash}
                      value={dispenser.tx_hash}
                      className={({ focus }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${focus ? "bg-blue-500 text-white" : "text-gray-900"}`
                      }
                    >
                      {({ selected, focus }) => (
                        <>
                          <div className="flex items-center">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                              <AssetIcon asset={dispenser.asset} />
                            </span>
                            <span
                              className={`ml-2 block truncate ${selected ? "font-medium" : "font-normal"}`}
                            >
                              {dispenser.asset} - {dispenser.tx_hash.substring(0, 8)}...
                            </span>
                          </div>
                          {selected && (
                            <span
                              className={`absolute inset-y-0 right-0 flex items-center pr-3 ${focus ? "text-white" : "text-blue-500"}`}
                            >
                              <FiCheck className="h-5 w-5" aria-hidden="true" />
                            </span>
                          )}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </div>
            </Listbox>
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Select the dispenser you want to close.
            </Description>
          </Field>
        )}
        <FeeRateInput
          id="sat_per_vbyte"
          value={formData.sat_per_vbyte}
          onChange={(value) => setFormData((prev) => ({ ...prev, sat_per_vbyte: value }))}
          error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
          showHelpText={shouldShowHelpText}
        />
        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
