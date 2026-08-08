import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { UtxoSourceField } from "@/components/domain/utxo/utxo-source-field";
import { DestinationInput } from "@/components/ui/inputs/destination-input";
import { useComposer } from "@/contexts/composer-context-object";
import type { MoveOptions } from "@/core/counterparty/compose";
import { useUtxoSource } from "@/hooks/useUtxoSource";

/**
 * Props for the UtxoMoveForm component, aligned with Composer's formAction.
 */
interface UtxoMoveFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: MoveOptions | null;
  initialUtxo?: string;
}

/**
 * Form for moving a UTXO using React 19 Actions.
 */
export function UtxoMoveForm({
  formAction,
  initialFormData,
  initialUtxo,
}: UtxoMoveFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, showHelpText } = useComposer();

  // Source UTXO and the balances it holds
  const source = useUtxoSource(initialUtxo, initialFormData?.sourceUtxo);

  // Form state
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(false); // Required field, so invalid until entered

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
          <AddressHeader
            address={activeAddress.address}
            walletName={activeWallet?.name ?? ""}
            className="mt-1 mb-5"
          />
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
        placeholder="Enter destination address"
        required
        disabled={false}
        showHelpText={showHelpText}
        name="destination_display"
      />
    </ComposerForm>
  );
}
