import { useParams } from "react-router-dom";
import { UtxoAttachForm } from "./form";
import { ReviewUtxoAttach } from "./review";
import { Composer } from "@/components/composer";
import { composeAttach } from "@/utils/blockchain/counterparty";
import type { AttachOptions } from "@/utils/blockchain/counterparty";

export function ComposeUtxoAttach() {
  const { asset } = useParams<{ asset: string }>();

  if (!asset) {
    return <div className="p-4 text-red-500">No asset specified</div>;
  }

  return (
    <div className="p-4">
      <Composer<AttachOptions>
        initialTitle={`Attach ${asset}`}
        FormComponent={(props) => (
          <UtxoAttachForm 
            {...props} 
            initialAsset={asset}
          />
        )}
        ReviewComponent={ReviewUtxoAttach}
        composeTransaction={composeAttach}
      />
    </div>
  );
}

export default ComposeUtxoAttach;
