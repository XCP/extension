import type { ReactElement } from "react";
import { useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { HashInput } from "@/components/ui/inputs/hash-input";
import { useComposer } from "@/contexts/composer-context-object";
import type { BTCPayOptions } from "@/core/counterparty/compose";

import { t } from '@/i18n';

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
            label={t('common_order_match_id')}
            name="order_match_id"
            hashType="match"
            placeholder={t('btcpay_form_enter_order_match_id')}
            required={true}
            showHelpText={showHelpText}
            description={t('btcpay_form_the_id_of_the_matched')}
            showCopyButton={true}
          />
          <input type="hidden" name="order_match_id" value={orderMatchId} />

    </ComposerForm>
  );
}
