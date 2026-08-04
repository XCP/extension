import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { AttachOptions } from "@/core/counterparty/compose";
import { composeAttach } from "@/core/counterparty/compose";
import { UtxoAttachForm } from "@/pages/compose/utxo/attach/form";
import { ReviewUtxoAttach } from "@/pages/compose/utxo/attach/review";

function ComposeUtxoAttachPage() {
  const { asset } = useParams<{ asset?: string }>();

  if (!asset) {
    return (
      <div className="p-4">
        <ErrorAlert message="Asset parameter is required" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Composer<AttachOptions>
        composeType="attach"
        composeApiMethod={composeAttach}
        initialTitle="Attach UTXO"
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
