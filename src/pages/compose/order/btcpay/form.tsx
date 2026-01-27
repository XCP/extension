import { useState } from "react";
import { ComposerForm } from "@/components/composer-form";
import { HashInput } from "@/components/inputs/hash-input";
import { AddressHeader } from "@/components/headers/address-header";
import { useComposer } from "@/contexts/composer-context";
import type { BTCPayOptions } from "@/utils/blockchain/counterparty/compose";
import type { ReactElement } from "react";

/**
 * Props for the BTCPayForm component, aligned with Composer's formAction.
 */
interface BTCPayFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BTCPayOptions | null;
}

/**
 * Form for submitting a BTC payment for an order match using React 19 Actions.
 */
export function BTCPayForm({ 
  formAction, 
  initialFormData,
}: BTCPayFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, showHelpText } = useComposer();
  const [orderMatchId, setOrderMatchId] = useState(initialFormData?.order_match_id || "");

  return (
    <ComposerForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
        )
      }
    >
          <HashInput
            value={orderMatchId}
            onChange={setOrderMatchId}
            label="Order Match ID"
            name="order_match_id"
            hashType="match"
            placeholder="Enter order match ID"
            required={true}
            showHelpText={showHelpText}
            description="The ID of the matched order. Found in your order history when a match occurs."
            showCopyButton={true}
          />
          <input type="hidden" name="order_match_id" value={orderMatchId} />

    </ComposerForm>
  );
}
