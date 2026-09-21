import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { UtxoSourceField } from "@/components/domain/utxo/utxo-source-field";
import { DestinationInput } from "@/components/ui/inputs/destination-input";
import { useComposer } from "@/contexts/composer-context-object";
import type { DetachOptions } from "@/core/counterparty/compose";
import { useUtxoSource } from "@/hooks/useUtxoSource";

/**
 * Props for the UtxoDetachForm component, aligned with Composer's formAction.
 */
interface UtxoDetachFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DetachOptions | null;
  initialUtxo?: string;
}

/**
 * Form for detaching assets from a UTXO using React 19 Actions.
 */
export function UtxoDetachForm({
  formAction,
  initialFormData,
  initialUtxo,
}: UtxoDetachFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, showHelpText } = useComposer();

  // Source UTXO and the balances it holds
  const source = useUtxoSource(initialUtxo, initialFormData?.sourceUtxo);

  // Form state
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(true); // Optional field, so default to true

  // Refs
  const destinationRef = useRef<HTMLInputElement>(null);

  // Effects

  // Focus destination input on mount
  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  return (
    <ComposerForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
        )
      }
      submitDisabled={!destinationValid}
    >
      <UtxoSourceField source={source} />

      <input type="hidden" name="destination" value={destination} />
      <DestinationInput
        ref={destinationRef}
        value={destination}
        onChange={setDestination}
        onValidationChange={setDestinationValid}
        placeholder="Leave empty to use UTXO's address"
        required={false}
        disabled={false}
        showHelpText={showHelpText}
        name="destination_display"
        label="Destination (Optional)"
        helpText="The address to detach assets to. If not provided, assets will be detached to the UTXO's owner address."
      />
    </ComposerForm>
  );
}
