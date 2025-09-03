"use client";

import { useEffect, useState } from "react";
import { ComposeForm } from "@/components/compose-form";
import { HashInput } from "@/components/inputs/hash-input";
import { AddressHeader } from "@/components/headers/address-header";
import { useComposer } from "@/contexts/composer-context";
import type { CancelOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the CancelForm component, aligned with Composer's formAction.
 */
interface CancelFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: CancelOptions | null;
  initialHash?: string;
}

/**
 * Form for canceling an order using React 19 Actions.
 */
export function CancelForm({
  formAction,
  initialFormData,
  initialHash,
}: CancelFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, settings, showHelpText } = useComposer();
  const [offerHash, setOfferHash] = useState(initialFormData?.offer_hash || initialHash || "");

  return (
    <ComposeForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
        )
      }
    >
          <HashInput
            value={offerHash}
            onChange={setOfferHash}
            label="Order Hash"
            name="offer_hash"
            hashType="offer"
            placeholder="Enter order hash (64 hex characters)..."
            required={true}
            showHelpText={showHelpText}
            description="Enter the hash of the order you want to cancel."
            showCopyButton={true}
          />
          <input type="hidden" name="offer_hash" value={offerHash} />

    </ComposeForm>
  );
}
