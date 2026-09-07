import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { AttachOptions } from "@/core/counterparty/compose";
import { composeAttach } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { UtxoAttachForm } from "@/pages/compose/utxo/attach/form";
import { ReviewUtxoAttach } from "@/pages/compose/utxo/attach/review";

function ComposeUtxoAttachPage() {
  const { asset } = useParams<{ asset?: string }>();

  if (!asset) {
    return (
      <div className="p-4">
        <ErrorAlert message={t('common_asset_parameter_is_required')} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Composer<AttachOptions>
        composeType="attach"
        composeApiMethod={composeAttach}
        initialTitle={t('utxo_attach_attach_utxo')}
        FormComponent={(props) => (
          <UtxoAttachForm
            {...props}
            initialAsset={asset}
          />
        )}
        ReviewComponent={ReviewUtxoAttach}
      />
    </div>
  );
}

export default ComposeUtxoAttachPage;
