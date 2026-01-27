import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { FiChevronDown, FaCheck, FaCopy } from "@/components/icons";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { Field, Label, Description, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/ui/headers/address-header";
import { useComposer } from "@/contexts/composer-context";
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

  // Form status
  const { pending } = useFormStatus();
  const { copy, isCopied } = useCopyToClipboard();


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
      className="size-5 rounded-full"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );

  return (
    <ComposerForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader
            address={activeAddress.address}
            walletName={activeWallet?.name ?? ""}
            className="mt-1 mb-5"
          />
        )
      }
    >
      {isLoading ? (
        <div className="py-4 text-center">Loading dispensers…</div>
      ) : (
            <Field>
              <Label className="block text-sm font-medium text-gray-700">
                Dispenser <span className="text-red-500">*</span>
              </Label>
              {relevantDispensers.length === 0 ? (
                <div className="relative w-full mt-1 cursor-not-allowed rounded-lg bg-gray-100 py-2.5 pl-3 pr-10 text-left border border-gray-300 text-gray-500 sm:text-sm">
                  <span className="block truncate">
                    No open dispensers found for {asset || "this address"}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <FiChevronDown className="size-4 text-gray-400" aria-hidden="true" />
                  </span>
                </div>
              ) : (
                <>
                  <Listbox
                    value={selectedTxHash}
                    onChange={setSelectedTxHash}
                    disabled={pending}
                  >
                    <div className="relative mt-1">
                    <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-gray-50 py-2.5 pl-3 pr-10 text-left border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed">
                      <div className="flex items-center">
                        {selectedDispenser?.asset && <AssetIcon asset={selectedDispenser.asset} />}
                        <span className={`block truncate ${selectedDispenser ? "ml-2" : ""}`}>
                          {selectedDispenser ? selectedDispenser.asset : "Select a dispenser"}
                        </span>
                      </div>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <FiChevronDown className="size-4 text-gray-400" aria-hidden="true" />
                      </span>
                    </ListboxButton>
                    <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                      {relevantDispensers.map((dispenser) => (
                        <ListboxOption
                          key={dispenser.tx_hash}
                          value={dispenser.tx_hash}
                          className={({ focus }) => `relative cursor-pointer select-none py-2.5 pl-10 pr-4 ${focus ? "bg-blue-500 text-white" : "text-gray-900"}`}
                        >
                          {({ selected, focus }) => (
                            <>
                              <div className="flex items-center">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                  <AssetIcon asset={dispenser.asset} />
                                </span>
                                <span className={`ml-2 block truncate ${selected ? "font-medium" : "font-normal"}`}>
                                  {dispenser.asset}
                                </span>
                              </div>
                              {selected && (
                                <span className={`absolute inset-y-0 right-0 flex items-center pr-3 ${focus ? "text-white" : "text-blue-500"}`}>
                                  <FaCheck className="size-4" aria-hidden="true" />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                    </div>
                  </Listbox>
                  <input type="hidden" name="asset" value={asset} />
                  <input type="hidden" name="status" value="10" />
                  {selectedDispenser && (
                    <div className="mt-3 text-sm p-3 bg-gray-50 rounded-md border border-gray-200 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Price</span>
                        <span className="font-medium text-gray-900">{selectedDispenser.satoshirate_normalized} BTC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Remaining</span>
                        <span className="font-medium text-gray-900">{selectedDispenser.give_remaining_normalized} {selectedDispenser.asset}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">TX Hash</span>
                        <button
                          type="button"
                          onClick={() => copy(selectedDispenser.tx_hash)}
                          className="flex items-center gap-1.5 font-mono text-xs text-gray-600 hover:text-gray-900"
                        >
                          {selectedDispenser.tx_hash.substring(0, 8)}…{selectedDispenser.tx_hash.slice(-6)}
                          {isCopied(selectedDispenser.tx_hash) ? (
                            <FaCheck className="size-3 text-green-500" />
                          ) : (
                            <FaCopy className="size-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-gray-500">
                    Dispensers enter a closing state for 5 blocks before fully closing.
                  </p>
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
