import { 
  Description,
  Field, 
  Label, 
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions
} from "@headlessui/react";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { DestinationInput } from "@/components/ui/inputs/destination-input";
import { MemoInput } from "@/components/ui/inputs/memo-input";
import { useComposer } from "@/contexts/composer-context-object";
import type { SweepOptions } from "@/core/counterparty/compose";
import { formatMoreOutputs } from "@/core/format";
import { validateAmount } from "@/core/validation/amount";
import { useAssetDetails } from "@/hooks/useAssetDetails";

import { t } from '@/i18n';

// Define sweep type options
// Note: FLAG_BINARY_MEMO (4) is handled automatically by normalize.ts based on memo content
const FLAG_BALANCES = 1;
const FLAG_OWNERSHIP = 2;

const sweepTypeOptions = [
  { id: 1, name: t('sweep_form_asset_balances_only'), value: FLAG_BALANCES },
  { id: 2, name: t('sweep_form_asset_ownership_only'), value: FLAG_OWNERSHIP },
  { id: 3, name: t('sweep_form_asset_balances_ownership'), value: FLAG_BALANCES | FLAG_OWNERSHIP },
];

interface SweepFormProps {
  formAction: (formData: FormData) => void | Promise<void>;
  initialFormData: SweepOptions | null;
}

export function SweepForm({ 
  formAction, 
  initialFormData
}: SweepFormProps): ReactElement {
  // Get everything from composer context
  const { activeAddress, activeWallet, settings, showHelpText, feeRate } = useComposer<SweepOptions>();
  const enableMoreOutputs = settings?.enableMoreOutputs ?? false;
  const { data: btcDetails } = useAssetDetails("BTC");
  const btcBalance = btcDetails?.availableBalance || "0";
  
  // Use form status for pending state
  const { pending } = useFormStatus();
  
  // Form state
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(false);
  const [memo, setMemo] = useState(initialFormData?.memo || "");
  const [memoValid, setMemoValid] = useState(true);
  const [showBtcOutput, setShowBtcOutput] = useState(false);
  const [btcAmount, setBtcAmount] = useState("");
  const [selectedSweepType, setSelectedSweepType] = useState(
    sweepTypeOptions.find(opt => opt.value === (initialFormData?.flags || (FLAG_BALANCES | FLAG_OWNERSHIP))) || sweepTypeOptions[2]!
  );
  
  // Refs
  const destinationRef = useRef<HTMLInputElement>(null);

  // Focus destination input on mount
  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  const moreOutputs = showBtcOutput ? formatMoreOutputs(btcAmount, destination) : undefined;
  const isBtcAmountValid = !showBtcOutput || validateAmount(btcAmount).isValid;
  const isSubmitDisabled = !destinationValid || !memoValid || !isBtcAmountValid;

  const handleFormAction = (formData: FormData) => {
    if (moreOutputs) {
      formData.set("more_outputs", moreOutputs);
    } else {
      formData.delete("more_outputs");
    }

    return formAction(formData);
  };

  return (
    <ComposerForm
      formAction={handleFormAction}
      header={
        activeAddress && (
          <AddressHeader 
            address={activeAddress.address} 
            walletName={activeWallet?.name} 
            className="mt-1 mb-5" 
          />
        )
      }
      submitText={t('common_sweep')}
      submitDisabled={isSubmitDisabled}
    >
      <Field>
        <Label className="block text-sm font-medium text-gray-700">
          
          {t('sweep_form_sweep_type')} <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1 relative">
          {/* Hidden input for form submission */}
          <input type="hidden" name="flags" value={selectedSweepType.value} />

          <Listbox value={selectedSweepType} onChange={setSelectedSweepType}>
            <ListboxButton className="w-full p-2.5 text-left rounded-md border border-gray-200 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" {...(pending === true && { disabled: true })}>
              {selectedSweepType.name}
            </ListboxButton>
            <ListboxOptions className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
              {sweepTypeOptions.map((option) => (
                <ListboxOption
                  key={option.id}
                  value={option}
                  className={({ focus, selected }) =>
                    `p-2.5 cursor-pointer select-none ${focus ? "bg-blue-500 text-white" : "text-gray-900"} ${selected ? "font-medium" : ""}`
                  }
                >
                  {option.name}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Listbox>
        </div>
        {showHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            {t('sweep_form_choose_whether_to_sweep_asset')}
          </Description>
        )}
      </Field>

      <input type="hidden" name="destination" value={destination} />
      <DestinationInput
        ref={destinationRef}
        value={destination}
        onChange={setDestination}
        onValidationChange={setDestinationValid}
        placeholder={t('sweep_form_enter_destination_address_for_sweep')}
        required
        disabled={pending}
        showHelpText={showHelpText}
        name="destination_display"
        helpText={t('sweep_form_enter_the_address_to_sweep')}
        labelRight={
          enableMoreOutputs ? (
            <button
              type="button"
              onClick={() => {
                setShowBtcOutput(!showBtcOutput);
                if (showBtcOutput) setBtcAmount("");
              }}
              className="text-xs font-normal text-blue-600 hover:text-blue-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              disabled={pending}
            >
              {showBtcOutput ? "− BTC" : "+ BTC"}
            </button>
          ) : undefined
        }
      />

      {enableMoreOutputs && showBtcOutput && (
        <AmountWithMaxInput
          asset="BTC"
          availableBalance={btcBalance}
          value={btcAmount}
          onChange={setBtcAmount}
          feeRate={feeRate}
          setError={() => {}}
          sourceAddress={activeAddress}
          maxAmount={btcBalance}
          showHelpText={showHelpText}
          label={t('common_add_btc')}
          placeholder="0.00000000 BTC"
          name="btc_output_display"
          description={t('sweep_form_btc_to_send_alongside_the')}
          disabled={pending}
          isDivisible={true}
          extraOutputCount={1}
        />
      )}

      <input type="hidden" name="memo" value={memo} />
      <MemoInput
        value={memo}
        onChange={setMemo}
        onValidationChange={setMemoValid}
        disabled={pending}
        showHelpText={showHelpText}
      />
    </ComposerForm>
  );
}
