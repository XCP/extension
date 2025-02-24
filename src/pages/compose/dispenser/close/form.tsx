"use client";

import { useFormStatus } from "react-dom";
import { FiChevronDown, FiCheck } from "react-icons/fi";
import {
  Field,
  Label,
  Description,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

interface Dispenser {
  tx_hash: string;
  asset: string;
}

/**
 * Props for the DispenserCloseForm component, aligned with Composer's formAction.
 */
interface DispenserCloseFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenserOptions | null;
  dispensers: Dispenser[];
  totalDispensers: number;
  asset: string;
}

/**
 * Form for closing a dispenser using React 19 Actions.
 */
export function DispenserCloseForm({
  formAction,
  initialFormData,
  dispensers,
  totalDispensers,
  asset,
}: DispenserCloseFormProps): ReactElement {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { data: assetDetails } = useAssetDetails(asset || initialFormData?.asset || "BTC");
  const { pending } = useFormStatus();

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

  return (
    <div className="space-y-4">
      {activeAddress && assetDetails && (initialFormData?.asset || asset) && (
        <BalanceHeader
          balance={{
            asset: initialFormData?.asset || asset,
            quantity_normalized: assetDetails.availableBalance,
            asset_info: assetDetails.assetInfo || {
              divisible: true,
              asset_longname: null,
              description: "",
              issuer: "",
              locked: false,
            },
          }}
          className="mb-5"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form action={formAction} className="space-y-6">
          {shouldUseAssetSelect ? (
            <AssetSelectInput
              selectedAsset={initialFormData?.asset || asset || ""}
              onChange={() => {}} // No-op since formAction handles submission
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
              <Listbox name="tx_hash" defaultValue={initialFormData?.open_address || ""} disabled={pending}>
                <ListboxButton className="relative w-full cursor-default rounded-lg bg-gray-50 py-2 pl-3 pr-10 text-left border focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed">
                  <div className="flex items-center">
                    {(initialFormData?.asset || asset) && <AssetIcon asset={initialFormData?.asset || asset} />}
                    <span className={`block truncate ${initialFormData?.asset || asset ? "ml-2" : ""}`}>
                      {initialFormData?.asset || asset || "Select an asset"}
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
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          focus ? "bg-blue-500 text-white" : "text-gray-900"
                        }`
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
                              className={`absolute inset-y-0 right-0 flex items-center pr-3 ${
                                focus ? "text-white" : "text-blue-500"
                              }`}
                            >
                              <FiCheck className="h-5 w-5" aria-hidden="true" />
                            </span>
                          )}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
              <input type="hidden" name="asset" value={asset || initialFormData?.asset || ""} />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Select the dispenser you want to close.
              </Description>
            </Field>
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
