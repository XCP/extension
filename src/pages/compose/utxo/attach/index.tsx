import { useParams } from "react-router-dom";
import { UtxoAttachForm } from "./form";
import { ReviewUtxoAttach } from "./review";
import { Composer } from "@/components/composer";
import { ErrorAlert } from "@/components/error-alert";
import { composeAttach } from "@/utils/blockchain/counterparty/compose";
import type { AttachOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeUtxoAttach() {
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

export default ComposeUtxoAttach;
