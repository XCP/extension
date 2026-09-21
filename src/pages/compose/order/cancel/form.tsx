import type { ReactElement } from "react";
import { useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { HashInput } from "@/components/ui/inputs/hash-input";
import { useComposer } from "@/contexts/composer-context-object";
import type { CancelOptions } from "@/core/counterparty/compose";

import { t } from '@/i18n';

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
  const { activeAddress, activeWallet, showHelpText } = useComposer();
  const [offerHash, setOfferHash] = useState(initialFormData?.offer_hash || initialHash || "");

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
            value={offerHash}
            onChange={setOfferHash}
            label={t('common_order_hash')}
            name="offer_hash"
            hashType="offer"
            placeholder={t('cancel_form_enter_order_transaction_hash')}
            required={true}
            showHelpText={showHelpText}
            description={t('cancel_form_transaction_hash_of_the_order')}
            showCopyButton={true}
          />
          <input type="hidden" name="offer_hash" value={offerHash} />

    </ComposerForm>
  );
}
