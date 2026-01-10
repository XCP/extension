import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { FiChevronDown, FaCheck } from "@/components/icons";
import { Field, Label, Description, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { ComposerForm } from "@/components/composer-form";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AddressHeader } from "@/components/headers/address-header";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { fetchAddressDispensers } from "@/utils/blockchain/counterparty/api";
import type { DispenserOptions } from "@/utils/blockchain/counterparty/compose";
import type { ReactElement } from "react";

/**
 * Props for the DispenserCloseForm component, aligned with Composer's formAction.
 */
interface DispenserCloseFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenserOptions | null;
  initialAsset?: string;
}

/**
 * Form for closing dispensers using React 19 Actions.
 */
export function DispenserCloseForm({
  formAction,
  initialFormData,
  initialAsset,
}: DispenserCloseFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, showHelpText, state } = useComposer();

  // Data fetching hooks
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(
    initialAsset || initialFormData?.asset || "BTC"
  );

  // Form status
  const { pending } = useFormStatus();


  // Form state
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);
  const [dispensers, setDispensers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Computed values
  const asset = initialAsset || initialFormData?.asset || "";
  const relevantDispensers = asset ? dispensers.filter((d) => d.asset === asset) : dispensers;
  const selectedDispenser = relevantDispensers.find((d) => d.tx_hash === selectedTxHash);

  // Effects - composer error first
  useEffect(() => {
    if (state.error) {
      // Error is shown through composer state
    }
  }, [state.error]);

  // Fetch dispensers when component mounts or address changes
  useEffect(() => {
    async function loadDispensers() {
      if (!activeAddress) return;
      
      setIsLoading(true);
      
      try {
        const response = await fetchAddressDispensers(
          activeAddress.address,
          { status: "open", verbose: true }
        );
        setDispensers(response.result);
      } catch (err) {
        console.error("Failed to load dispensers:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadDispensers();
  }, [activeAddress]);

  // Handlers  
  const AssetIcon = ({ asset }: { asset: string }): ReactElement => (
    <img
      src={`https://app.xcp.io/img/icon/${asset}`}
      alt={`${asset} icon`}
      className="w-5 h-5 rounded-full"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );

  return (
    <ComposerForm
      formAction={formAction}
      header={
        <div className="space-y-4">
          {activeAddress && (
            <AddressHeader
              address={activeAddress.address}
              walletName={activeWallet?.name ?? ""}
              className="mt-1 mb-5"
            />
          )}
          {activeAddress && assetDetails && (initialFormData?.asset || asset) && (
            <BalanceHeader
              balance={{
                asset: initialFormData?.asset || asset,
                quantity_normalized: assetDetails.availableBalance,
                asset_info: assetDetails.assetInfo ? {
                  asset_longname: assetDetails.assetInfo.asset_longname,
                  description: assetDetails.assetInfo.description || '',
                  issuer: assetDetails.assetInfo.issuer || 'Unknown',
                  divisible: assetDetails.assetInfo.divisible,
                  locked: assetDetails.assetInfo.locked,
                  supply: assetDetails.assetInfo.supply,
                } : { divisible: true, asset_longname: null, description: "", issuer: "", locked: false },
              }}
              className="mt-1 mb-5"
            />
          )}
          {assetDetailsError && <div className="text-red-500 mb-2">Failed to fetch asset details.</div>}
        </div>
      }
    >
      {isLoading ? (
        <div className="py-4 text-center">Loading dispensers...</div>
      ) : (
            <Field>
              <Label className="block text-sm font-medium text-gray-700">
                Dispenser <span className="text-red-500">*</span>
              </Label>
              {relevantDispensers.length === 0 ? (
                <div className="relative w-full mt-1 cursor-not-allowed rounded-lg bg-gray-100 py-2 pl-3 pr-10 text-left border border-gray-300 text-gray-500 sm:text-sm">
                  <span className="block truncate">
                    No open dispensers found for {asset || "this address"}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <FiChevronDown className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </span>
                </div>
              ) : (
                <>
                  <Listbox
                    name="tx_hash"
                    value={selectedTxHash}
                    onChange={setSelectedTxHash}
                    disabled={pending}
                  >
                    <ListboxButton className="relative w-full cursor-default rounded-lg bg-gray-50 py-2 pl-3 pr-10 text-left border focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed">
                      <div className="flex items-center">
                        {selectedDispenser?.asset && <AssetIcon asset={selectedDispenser.asset} />}
                        <span className={`block truncate ${selectedDispenser ? "ml-2" : ""}`}>
                          {selectedDispenser ? `${selectedDispenser.asset} - ${selectedDispenser.tx_hash.substring(0, 8)}...` : "Select a dispenser"}
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
                          className={({ focus }) => `relative cursor-pointer select-none py-2 pl-10 pr-4 ${focus ? "bg-blue-500 text-white" : "text-gray-900"}`}
                        >
                          {({ selected, focus }) => (
                            <>
                              <div className="flex items-center">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                  <AssetIcon asset={dispenser.asset} />
                                </span>
                                <span className={`ml-2 block truncate ${selected ? "font-medium" : "font-normal"}`}>
                                  {dispenser.asset} - {dispenser.tx_hash.substring(0, 8)}...
                                </span>
                              </div>
                              {selected && (
                                <span className={`absolute inset-y-0 right-0 flex items-center pr-3 ${focus ? "text-white" : "text-blue-500"}`}>
                                  <FaCheck className="h-5 w-5" aria-hidden="true" />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </Listbox>
                  <input type="hidden" name="asset" value={asset} />
                  {selectedDispenser && (
                    <div className="mt-2 text-sm text-gray-700">
                      <p>Asset: {selectedDispenser.asset}</p>
                      <p>Give Quantity: {selectedDispenser.give_quantity_normalized}</p>
                      <p>Escrow Quantity: {selectedDispenser.escrow_quantity_normalized}</p>
                      <p>Price: {selectedDispenser.price_normalized}</p>
                    </div>
                  )}
                  {showHelpText && (
                    <Description className="mt-2 text-sm text-gray-500">
                      Select the dispenser you want to close.
                    </Description>
                  )}
                </>
              )}
            </Field>

      )}
    </ComposerForm>
  );
}
